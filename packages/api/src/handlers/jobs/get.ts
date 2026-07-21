import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';

const jobs = new JobsRepository();

async function getHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const jobId = getPathParam(event, 'jobId');
  const job = await jobs.getById(jobId);

  if (!job) {
    throw new NotFoundError('Job', jobId);
  }

  // Pre-acceptance: return limited info
  return ok({
    jobId: job.jobId,
    status: job.status,
    publishedAt: job.publishedAt,
    expiresAt: job.expiresAt,
    introductionFee: job.introductionFee,
    location: { postcode: job.location?.postcode },
    vehicleSummary: job.vehicleSummary,
    damageSummary: job.damageSummary,
    repairMethods: job.repairMethods,
    indicativeCost: job.indicativeCost,
  });
}

export const handler = withErrorHandler(getHandler);
