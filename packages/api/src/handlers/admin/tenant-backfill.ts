import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { docClient, TABLES, WarrantyCompaniesRepository } from '@corexpert/db';
import { getScheme } from '@corexpert/core';
import type { Case, Job, WarrantyCompany } from '@corexpert/core';
import { scanAll } from '../../lib/mi-util';

const companies = new WarrantyCompaniesRepository();

/**
 * Tenant backfill migration (TRX-77). Idempotent + re-runnable, admin-only:
 *  1. Ensure the default tenant (DEMOTENANT) exists as a WarrantyCompany, so
 *     stamped cases resolve a scheme and it shows in admin filters.
 *  2. Stamp any case/job lacking a warrantyCompanyId with the default tenant.
 * Rows that already carry a tenant are skipped, so it's safe to run again.
 */
async function tenantBackfillHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const defaultTenant = process.env['DEFAULT_WARRANTY_COMPANY_ID'] ?? 'demotenant';

  // 1) Ensure the default-tenant company row exists (seed its scheme from the
  //    deploy default template so triage/pricing has a ruleset).
  let ensuredCompany = false;
  const existing = await companies.getById(defaultTenant);
  if (!existing) {
    const template = getScheme(process.env['WARRANTY_SCHEME']);
    const now = new Date().toISOString();
    const company: WarrantyCompany = {
      warrantyCompanyId: defaultTenant,
      name: 'DEMOTENANT',
      status: 'ACTIVE',
      scheme: { eligibility: template.eligibility, matrix: template.matrix },
      createdAt: now,
      updatedAt: now,
    };
    await companies.create(company);
    ensuredCompany = true;
  }

  // 2) Stamp legacy case/job rows that predate tenant stamping.
  const stamp = async (table: string, idKey: string, rows: { id: string; has: boolean }[]) => {
    let stamped = 0;
    for (const r of rows) {
      if (r.has) continue;
      await docClient.send(new UpdateCommand({
        TableName: table,
        Key: { [idKey]: r.id },
        UpdateExpression: 'SET warrantyCompanyId = :t',
        // Only stamp if still missing — safe under concurrent runs.
        ConditionExpression: 'attribute_not_exists(warrantyCompanyId)',
        ExpressionAttributeValues: { ':t': defaultTenant },
      })).catch((err) => { if ((err as Error).name !== 'ConditionalCheckFailedException') throw err; });
      stamped += 1;
    }
    return stamped;
  };

  const cases = await scanAll<Pick<Case, 'caseId' | 'warrantyCompanyId'>>(TABLES.CASES, 'caseId, warrantyCompanyId');
  const jobs = await scanAll<Pick<Job, 'jobId' | 'warrantyCompanyId'>>(TABLES.JOBS, 'jobId, warrantyCompanyId');
  const casesStamped = await stamp(TABLES.CASES, 'caseId', cases.map((c) => ({ id: c.caseId, has: !!c.warrantyCompanyId })));
  const jobsStamped = await stamp(TABLES.JOBS, 'jobId', jobs.map((j) => ({ id: j.jobId, has: !!j.warrantyCompanyId })));

  const summary = {
    defaultTenant,
    ensuredCompany,
    casesScanned: cases.length,
    casesStamped,
    jobsScanned: jobs.length,
    jobsStamped,
  };
  logger.info('Tenant backfill complete', summary);
  return ok(summary);
}

export const handler = withErrorHandler(tenantBackfillHandler);
