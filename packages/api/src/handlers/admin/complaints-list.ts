import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getQueryParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { ComplaintsRepository } from '@corexpert/db';

const complaints = new ComplaintsRepository();

/**
 * Admin complaints list (TRX-24). Optional `?organisationId=` (uses the org GSI)
 * and `?warrantyCompanyId=` / `?status=` filters for the whole-list scan.
 */
async function listComplaintsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const organisationId = getQueryParam(event, 'organisationId');
  const warrantyCompanyId = getQueryParam(event, 'warrantyCompanyId');
  const status = getQueryParam(event, 'status');

  let items = organisationId
    ? await complaints.listByOrganisation(organisationId)
    : await complaints.list();
  if (warrantyCompanyId) items = items.filter((c) => c.warrantyCompanyId === warrantyCompanyId);
  if (status) items = items.filter((c) => c.status === status);

  return ok({ items });
}

export const handler = withErrorHandler(listComplaintsHandler);
