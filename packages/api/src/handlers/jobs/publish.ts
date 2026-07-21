import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { created } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository, JobsRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';
import type { Job, CaseStatus } from '@corexpert/core';

const INTRODUCTION_FEE = Number(process.env['INTRODUCTION_FEE'] ?? '2500');
const JOB_EXPIRY_DAYS = 7;

const cases = new CasesRepository();
const jobs = new JobsRepository();

async function publishHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  if (caseData.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to publish this case');
  }
  if (!caseData.triageResult) {
    throw new ValidationError('Triage must be complete before publishing');
  }
  if (caseData.status !== 'TRIAGE_COMPLETE' && caseData.status !== 'XPERT_REVIEW') {
    throw new ValidationError(`Case cannot be published in ${caseData.status} status`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + JOB_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Extract unique repair methods from triage panels
  const repairMethods = [...new Set(
    caseData.triageResult.panels.map((p) => p.repairMethod),
  )];

  const job: Job = {
    jobId: randomUUID(),
    caseId,
    status: 'OPEN',
    publishedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    introductionFee: INTRODUCTION_FEE,
    location: {
      postcode: caseData.postcode ?? '',
    },
    vehicleSummary: {
      make: caseData.vehicle?.make ?? '',
      model: caseData.vehicle?.model ?? '',
      year: caseData.vehicle?.year,
      vehicleSize: caseData.vehicle?.vehicleSize ?? 'MEDIUM',
    },
    damageSummary: caseData.triageResult.summary,
    repairMethods,
    indicativeCost: caseData.triageResult.totalEstimatedCost,
    notificationsSent: 0,
    createdAt: now.toISOString(),
  };

  await jobs.create(job);
  await cases.updateStatus(caseId, 'PUBLISHED' as CaseStatus);

  logger.info('Job published', { jobId: job.jobId, caseId });

  return created(job);
}

export const handler = withErrorHandler(publishHandler);
