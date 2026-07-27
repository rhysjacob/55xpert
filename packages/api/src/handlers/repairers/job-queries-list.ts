import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobQueriesRepository } from '@corexpert/db';

const queries = new JobQueriesRepository();

/** The repairer's own query thread for a job (TRX-57). */
async function listHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');
  const jobId = getPathParam(event, 'jobId');

  const items = (await queries.listByJob(jobId)).filter((q) => q.repairerId === auth.userId);
  return ok({ items });
}

export const handler = withErrorHandler(listHandler);
