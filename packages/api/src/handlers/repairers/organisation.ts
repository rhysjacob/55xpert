import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UsersRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';
import { capabilitySchema } from '../../lib/organisation-schema';

const users = new UsersRepository();
const orgs = new OrganisationsRepository();

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  capability: capabilitySchema.optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

/**
 * A repairer viewing/editing their own organisation's capability + coverage
 * (TRX-18). Editing standing (status) or network membership stays admin-only —
 * a repairer can only change what they can do and where, not their approval.
 *
 * GET /repairer/organisation  · PUT /repairer/organisation
 */
async function organisationHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const user = await users.getById(auth.userId);
  if (!user?.organisationId) throw new NotFoundError('Organisation for repairer', auth.userId);
  const org = await orgs.getById(user.organisationId);
  if (!org) throw new NotFoundError('Organisation', user.organisationId);

  if (event.requestContext.http.method === 'GET') {
    // Include members + whether the caller is the primary contact (who may
    // invite) and whether the org is live (TRX-21 registration status / TRX-52).
    const members = await users.listByOrganisation(org.organisationId);
    return ok({
      organisation: org,
      members: members.map((m) => ({
        userId: m.userId,
        email: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        isActive: m.isActive,
        isPrimaryContact: m.userId === org.primaryContactUserId,
      })),
      canInvite: org.primaryContactUserId === user.userId,
      isLive: org.status === 'ACTIVE',
    });
  }

  // PUT — self-serve capability/name edit (not status, not membership).
  const body = parseBody(event, updateSchema);
  await orgs.update(org.organisationId, body);
  return ok({ organisation: await orgs.getById(org.organisationId) });
}

export const handler = withErrorHandler(organisationHandler);
