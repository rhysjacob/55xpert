import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobsRepository, CasesRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import { presignImages } from '../../lib/image-urls';

const jobs = new JobsRepository();
const cases = new CasesRepository();

async function getHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const jobId = getPathParam(event, 'jobId');
  const job = await jobs.getById(jobId);

  if (!job) {
    throw new NotFoundError('Job', jobId);
  }

  // Damage photos help the repairer decide whether to accept — they carry no
  // personal data, so we expose them pre-acceptance (unlike contact details).
  const caseData = await cases.getById(job.caseId);
  const images = caseData
    ? (await presignImages(caseData.images)).map((img) => ({
        imageType: img.imageType,
        url: img.url,
      }))
    : [];

  // Pre-acceptance: return limited info (no customer contact details)
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
    images,
  });
}

export const handler = withErrorHandler(getHandler);
