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
  vehicleSizes: z.array(z.enum(['SMALL', 'MEDIUM', 'LARGE'])).optional(),
  repairMethods: z.array(z.enum(['REPAIR', 'REPLACE', 'BLEND', 'PDR'])).optional(),
  notifyByEmail: z.boolean().optional(),
  notifyByWhatsApp: z.boolean().optional(),
  // Loose E.164-ish check; the WhatsApp API validates properly on send.
  whatsappNumber: z.string().regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('')),
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

  // Normalise the WhatsApp number: '' clears it, and clearing it turns the
  // channel off (can't alert without a number).
  const nextNumber = body.whatsappNumber === undefined
    ? existing.preferences?.whatsappNumber
    : (body.whatsappNumber.trim() || undefined);
  const nextWhatsApp = nextNumber ? (body.notifyByWhatsApp ?? existing.preferences?.notifyByWhatsApp ?? false) : false;

  await users.update(auth.userId, {
    preferences: {
      maxDistanceMiles: body.maxDistanceMiles ?? existing.preferences?.maxDistanceMiles,
      minLabourRate: body.minLabourRate ?? existing.preferences?.minLabourRate,
      vehicleSizes: body.vehicleSizes ?? existing.preferences?.vehicleSizes ?? [],
      repairMethods: body.repairMethods ?? existing.preferences?.repairMethods ?? [],
      notifyByEmail: body.notifyByEmail ?? existing.preferences?.notifyByEmail ?? true,
      notifyByWhatsApp: nextWhatsApp,
      ...(nextNumber ? { whatsappNumber: nextNumber } : {}),
    },
  });

  const updated = await users.getById(auth.userId);
  return ok(updated?.preferences ?? {});
}

export const handler = withErrorHandler(preferencesHandler);
