import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { JobsRepository, CasesRepository } from '@corexpert/db';
import { NotFoundError, ConflictError } from '@corexpert/core';
import type { CaseStatus } from '@corexpert/core';

const jobs = new JobsRepository();
const cases = new CasesRepository();

async function acceptHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const jobId = getPathParam(event, 'jobId');

  const job = await jobs.getById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }

  // Check expiry
  if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
    throw new ConflictError('This job has expired');
  }

  // Attempt conditional write (fastest finger wins)
  const accepted = await jobs.acceptJob(jobId, auth.userId);

  if (!accepted) {
    throw new ConflictError('This job has already been accepted by another repairer');
  }

  // Update case status
  await cases.updateStatus(job.caseId, 'ACCEPTED' as CaseStatus);

  logger.info('Job accepted', {
    jobId,
    repairerId: auth.userId,
    caseId: job.caseId,
  });

  // Return acceptance confirmation with payment info
  return ok({
    jobId,
    accepted: true,
    introductionFee: job.introductionFee,
    message: 'Job accepted. Please complete payment to access full details.',
  });
}

export const handler = withErrorHandler(acceptHandler);
