import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { UsersRepository } from '@corexpert/db';
import { NotFoundError, ValidationError } from '@corexpert/core';

const updateRepairerSchema = z.object({
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
});

const users = new UsersRepository();

async function updateRepairerHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const userId = getPathParam(event, 'repairerId');
  const body = parseBody(event, updateRepairerSchema);

  const existing = await users.getById(userId);
  if (!existing) {
    throw new NotFoundError('Repairer', userId);
  }
  if (existing.role !== 'REPAIRER') {
    throw new ValidationError('User is not a repairer');
  }

  const updates: Record<string, unknown> = {};
  if (body.isActive !== undefined) updates['isActive'] = body.isActive;
  if (body.isVerified !== undefined && existing.repairer) {
    updates['repairer'] = { ...existing.repairer, isVerified: body.isVerified };
  }

  await users.update(userId, updates);

  const updated = await users.getById(userId);
  return ok(updated);
}

export const handler = withErrorHandler(updateRepairerHandler);
