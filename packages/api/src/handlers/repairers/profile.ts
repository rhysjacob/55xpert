import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { UsersRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';

const users = new UsersRepository();

async function profileHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const user = await users.getById(auth.userId);
  if (!user) {
    throw new NotFoundError('User', auth.userId);
  }

  return ok({
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    repairer: user.repairer,
    preferences: user.preferences,
  });
}

export const handler = withErrorHandler(profileHandler);
