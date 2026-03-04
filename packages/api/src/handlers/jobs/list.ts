import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobsRepository } from '@corexpert/db';

const jobs = new JobsRepository();

async function listHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const limit = Number(getQueryParam(event, 'limit', '20'));
  const lastKey = getQueryParam(event, 'cursor');

  const result = await jobs.listByStatus(
    'OPEN',
    Math.min(limit, 100),
    lastKey ? JSON.parse(Buffer.from(lastKey, 'base64url').toString()) : undefined,
  );

  // Return limited info (pre-acceptance view)
  const items = result.items.map((job) => ({
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
  }));

  return ok({
    items,
    cursor: result.lastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64url')
      : null,
  });
}

export const handler = withErrorHandler(listHandler);
