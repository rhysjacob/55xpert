import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UsersRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';

const preferencesSchema = z.object({
  maxDistanceMiles: z.number().min(1).max(200).optional(),
  minLabourRate: z.number().min(0).optional(),
  vehicleSizes: z.array(z.enum(['SMALL', 'MEDIUM', 'LARGE', 'VAN', 'SUV'])).optional(),
  repairMethods: z.array(z.enum(['REPAIR', 'REPLACE', 'BLEND', 'PDR', 'SMART_REPAIR'])).optional(),
  notifyByEmail: z.boolean().optional(),
});

const users = new UsersRepository();

async function preferencesHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const method = event.requestContext.http.method;

  if (method === 'GET') {
    const user = await users.getById(auth.userId);
    if (!user) throw new NotFoundError('User', auth.userId);
    return ok(user.preferences ?? {});
  }

  // PUT
  const body = parseBody(event, preferencesSchema);

  const existing = await users.getById(auth.userId);
  if (!existing) throw new NotFoundError('User', auth.userId);

  await users.update(auth.userId, {
    preferences: { ...existing.preferences, ...body },
  });

  const updated = await users.getById(auth.userId);
  return ok(updated?.preferences ?? {});
}

export const handler = withErrorHandler(preferencesHandler);
