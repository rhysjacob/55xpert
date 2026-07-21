import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';

const cases = new CasesRepository();

async function listHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const limit = Number(getQueryParam(event, 'limit', '20'));
  const lastKey = getQueryParam(event, 'cursor');

  const result = await cases.listByUser(
    auth.userId,
    Math.min(limit, 100),
    lastKey ? JSON.parse(Buffer.from(lastKey, 'base64url').toString()) : undefined,
  );

  return ok({
    items: result.items,
    cursor: result.lastKey
      ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64url')
      : null,
  });
}

export const handler = withErrorHandler(listHandler);
