import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { LeadsRepository } from '@corexpert/db';

const leads = new LeadsRepository();

/** Admin view of captured marketing leads (TRX-71). */
async function listLeadsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');
  return ok({ items: await leads.list() });
}

export const handler = withErrorHandler(listLeadsHandler);
