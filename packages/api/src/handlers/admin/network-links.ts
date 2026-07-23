import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { NetworkLinksRepository, WarrantyCompaniesRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import type { RepairerNetworkLink } from '@corexpert/core';

const links = new NetworkLinksRepository();
const companies = new WarrantyCompaniesRepository();
const orgs = new OrganisationsRepository();

const upsertSchema = z.object({
  organisationId: z.string().min(1),
  enabled: z.boolean().optional(),
});

/**
 * Admin management of a warranty company's repairer network (TRX-78). A job
 * from company X only reaches organisations linked AND enabled for X.
 *
 * GET  /admin/warranty-companies/{companyId}/network      → list the network
 * PUT  /admin/warranty-companies/{companyId}/network      → add / toggle a link
 */
async function networkLinksHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const companyId = getPathParam(event, 'companyId');
  const company = await companies.getById(companyId);
  if (!company) throw new NotFoundError('WarrantyCompany', companyId);

  if (event.requestContext.http.method === 'GET') {
    return ok({ items: await links.listByCompany(companyId) });
  }

  // PUT — add a link or toggle its enabled flag.
  const body = parseBody(event, upsertSchema);
  const org = await orgs.getById(body.organisationId);
  if (!org) throw new NotFoundError('Organisation', body.organisationId);

  const now = new Date().toISOString();
  const link: RepairerNetworkLink = {
    warrantyCompanyId: companyId,
    organisationId: body.organisationId,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
  await links.put(link);
  return ok({ link });
}

export const handler = withErrorHandler(networkLinksHandler);
