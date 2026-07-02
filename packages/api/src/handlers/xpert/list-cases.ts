import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository } from '@corexpert/db';

const cases = new CasesRepository();

async function listCasesHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  logger.info('Xpert list-cases auth', { email: auth.email, roles: auth.roles });
  requireRole(auth, 'XPERT', 'ADMIN');

  const limit = Number(getQueryParam(event, 'limit', '20'));

  // The queue holds cases awaiting review AND ineligible cases — an Xpert can
  // still pick up a rejected case and override the automatic decision. Merge the
  // two status buckets, newest first.
  const [review, ineligible] = await Promise.all([
    cases.listByStatus('XPERT_REVIEW', 100),
    cases.listByStatus('INELIGIBLE', 100),
  ]);
  const items = [...review.items, ...ineligible.items]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, Math.min(limit, 100));

  logger.info('Xpert list-cases result', { count: items.length });

  return ok({ items, cursor: null });
}

export const handler = withErrorHandler(listCasesHandler);
