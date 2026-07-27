import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobQueriesRepository } from '@corexpert/db';

const queries = new JobQueriesRepository();

/** Admin/Xpert queue of repairer expert-queries (TRX-57). Optional `?status=`. */
async function listHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN', 'XPERT');

  const status = getQueryParam(event, 'status');
  let items = await queries.list();
  if (status) items = items.filter((q) => q.status === status);
  return ok({ items });
}

export const handler = withErrorHandler(listHandler);
