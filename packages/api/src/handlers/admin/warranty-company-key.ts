import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { WarrantyCompaniesRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import { generateIngestKey } from '../../lib/ingest-auth';

const companies = new WarrantyCompaniesRepository();

/**
 * Admin issues (or rotates) a warranty company's ingestion API key (TRX-14/79).
 * The plaintext key is returned ONCE in this response and never stored — only
 * its hash is persisted. Rotating invalidates the previous key.
 *
 * POST /admin/warranty-companies/{companyId}/ingest-key
 */
async function issueKeyHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const companyId = getPathParam(event, 'companyId');
  const company = await companies.getById(companyId);
  if (!company) throw new NotFoundError('WarrantyCompany', companyId);

  const { key, hash } = generateIngestKey();
  await companies.setIngestKeyHash(companyId, hash);

  return ok({
    warrantyCompanyId: companyId,
    apiKey: key,
    note: 'Store this now — it is shown only once. Send it as the x-api-key header on ingestion requests.',
  });
}

export const handler = withErrorHandler(issueKeyHandler);
