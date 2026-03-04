import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UsersRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  repairer: z.object({
    businessName: z.string().min(1).max(200).optional(),
    contactName: z.string().max(200).optional(),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    postcode: z.string().max(10).optional(),
  }).optional(),
});

const users = new UsersRepository();

async function updateProfileHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const body = parseBody(event, updateProfileSchema);

  const existing = await users.getById(auth.userId);
  if (!existing) {
    throw new NotFoundError('User', auth.userId);
  }

  const updates: Record<string, unknown> = {};
  if (body.firstName !== undefined) updates['firstName'] = body.firstName;
  if (body.lastName !== undefined) updates['lastName'] = body.lastName;
  if (body.phone !== undefined) updates['phone'] = body.phone;
  if (body.repairer !== undefined) {
    updates['repairer'] = { ...existing.repairer, ...body.repairer };
  }

  await users.update(auth.userId, updates);

  const updated = await users.getById(auth.userId);
  return ok(updated);
}

export const handler = withErrorHandler(updateProfileHandler);
