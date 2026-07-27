import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { JobsRepository, JobQueriesRepository, UsersRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError } from '@corexpert/core';
import type { JobQuery } from '@corexpert/core';
import { emitDomainEvent, DomainEvent } from '../../lib/events';

const jobs = new JobsRepository();
const queries = new JobQueriesRepository();
const users = new UsersRepository();

const schema = z.object({ question: z.string().min(1).max(4000) });

/**
 * Raise a "question / refer to an expert" on an ACCEPTED job (TRX-57) — the
 * deliberate "get out of jail" flow, NOT a reject. The match fee stands. Only
 * the repairer who accepted the job may raise a query; we record it and emit an
 * event so the Xpert team is alerted (email now, WhatsApp when live) without
 * blocking the request.
 */
async function createHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');
  const jobId = getPathParam(event, 'jobId');
  const { question } = parseBody(event, schema);

  const job = await jobs.getById(jobId);
  if (!job) throw new NotFoundError('Job', jobId);
  if (job.acceptance?.repairerId !== auth.userId) {
    throw new ForbiddenError('You can only raise a query on a job you have accepted');
  }

  const user = await users.getById(auth.userId);
  const now = new Date().toISOString();
  const v = job.vehicleSummary;
  const vehicle = [v?.year, v?.make, v?.model].filter(Boolean).join(' ');
  const query: JobQuery = {
    queryId: randomUUID(),
    jobId,
    caseId: job.caseId,
    repairerId: auth.userId,
    ...(user?.repairer?.businessName ? { repairerName: user.repairer.businessName } : {}),
    ...(user?.organisationId ? { organisationId: user.organisationId } : {}),
    ...(job.warrantyCompanyId ? { warrantyCompanyId: job.warrantyCompanyId } : {}),
    ...(vehicle ? { vehicle } : {}),
    status: 'OPEN',
    question,
    createdAt: now,
    updatedAt: now,
  };
  await queries.create(query);
  await emitDomainEvent(DomainEvent.JOB_QUERY_RAISED, { queryId: query.queryId });

  logger.info('Expert query raised', { queryId: query.queryId, jobId, repairerId: auth.userId });
  return ok({ query, feeUnaffected: true });
}

export const handler = withErrorHandler(createHandler);
