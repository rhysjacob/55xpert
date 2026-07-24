import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobsRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError, ValidationError, ConflictError } from '@corexpert/core';

const jobs = new JobsRepository();
const orgs = new OrganisationsRepository();

const pushSchema = z.object({
  organisationIds: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * Admin manual override: push an OPEN job to specific repairer organisations
 * (TRX-20). Those orgs then see the job regardless of automatic matching. Sets
 * the full pushed list (idempotent). Rejects unknown orgs and non-OPEN jobs.
 */
async function pushJobHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const jobId = getPathParam(event, 'jobId');
  const { organisationIds } = parseBody(event, pushSchema);

  const job = await jobs.getById(jobId);
  if (!job) throw new NotFoundError('Job', jobId);
  if (job.status !== 'OPEN') {
    throw new ValidationError(`Job ${jobId} is ${job.status}, not OPEN — cannot push`);
  }

  const ids = [...new Set(organisationIds)];
  const found = await Promise.all(ids.map((id) => orgs.getById(id)));
  const missing = ids.filter((_, i) => !found[i]);
  if (missing.length) throw new ValidationError(`Unknown organisation(s): ${missing.join(', ')}`);

  try {
    await jobs.setPushedOrganisations(jobId, ids);
  } catch (err) {
    // Lost a race with acceptance/expiry between the read and the write.
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new ConflictError(`Job ${jobId} is no longer OPEN`);
    }
    throw err;
  }

  return ok({ jobId, pushedOrganisationIds: ids });
}

export const handler = withErrorHandler(pushJobHandler);
