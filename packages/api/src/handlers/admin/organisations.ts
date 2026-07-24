import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { OrganisationsRepository, UsersRepository } from '@corexpert/db';
import { NotFoundError, ConflictError } from '@corexpert/core';
import type { RepairerOrganisation } from '@corexpert/core';
import { capabilitySchema } from '../../lib/organisation-schema';
import { geocodeCapabilityBase } from '../../lib/geocode';

const orgs = new OrganisationsRepository();
const users = new UsersRepository();

const emptyCapability = { vehicleSizes: [], repairMethods: [], coverageAreas: [] };

const createSchema = z.object({
  name: z.string().min(1),
  organisationId: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
  capability: capabilitySchema.optional(),
  primaryContactUserId: z.string().min(1).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
    capability: capabilitySchema.optional(),
    primaryContactUserId: z.string().min(1).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' });

/**
 * Admin CRUD for repairer organisations (TRX-37/49) — the company that groups
 * repairer users and carries capability, coverage and registration status
 * (TRX-18/21). Members are attached via the user's organisationId; the
 * enable/disable cascade to members is TRX-22 (PR3).
 */
async function organisationsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const method = event.requestContext.http.method;
  const id = event.pathParameters?.['organisationId'];

  if (!id) {
    if (method === 'GET') return ok({ items: await orgs.list() });

    const body = parseBody(event, createSchema);
    const now = new Date().toISOString();
    const org: RepairerOrganisation = {
      organisationId: body.organisationId ?? randomUUID(),
      name: body.name,
      status: body.status ?? 'PENDING',
      capability: body.capability ? await geocodeCapabilityBase(body.capability) : emptyCapability,
      ...(body.primaryContactUserId ? { primaryContactUserId: body.primaryContactUserId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await orgs.create(org);
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        throw new ConflictError(`Organisation ${org.organisationId} already exists`);
      }
      throw err;
    }
    return ok({ organisation: org });
  }

  if (method === 'GET') {
    const org = await orgs.getById(getPathParam(event, 'organisationId'));
    if (!org) throw new NotFoundError('Organisation', id);
    const members = await users.listByOrganisation(id);
    return ok({ organisation: org, members: members.map((u) => ({ userId: u.userId, email: u.email })) });
  }

  // PUT — patch name/status/capability/primary contact.
  const body = parseBody(event, updateSchema);
  const existing = await orgs.getById(id);
  if (!existing) throw new NotFoundError('Organisation', id);
  // Re-geocode the base whenever capability (which carries basePostcode) changes.
  const patch = body.capability ? { ...body, capability: await geocodeCapabilityBase(body.capability) } : body;
  await orgs.update(id, patch);

  // Enable/disable cascade (TRX-22): a status change flows to every member's
  // login. ACTIVE re-enables; SUSPENDED/DISABLED/PENDING disables — so a
  // disabled org's members can't sign in or accept, and matching already skips
  // non-ACTIVE orgs. Only cascade when the status actually changed.
  let cascaded = 0;
  if (body.status && body.status !== existing.status) {
    const active = body.status === 'ACTIVE';
    const members = await users.listByOrganisation(id);
    await Promise.all(
      members
        .filter((m) => m.isActive !== active)
        .map((m) => users.update(m.userId, { isActive: active })),
    );
    cascaded = members.length;
  }

  return ok({ organisation: await orgs.getById(id), membersCascaded: cascaded });
}

export const handler = withErrorHandler(organisationsHandler);
