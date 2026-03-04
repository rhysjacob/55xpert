import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { UsersRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import type { User, UserRole } from '@corexpert/core';

const users = new UsersRepository();

/**
 * Cognito Post-Confirmation trigger.
 * Creates a user record in DynamoDB when a new user confirms their account.
 * The role is determined by the app client that initiated the signup.
 */
export async function handler(event: PostConfirmationTriggerEvent): Promise<PostConfirmationTriggerEvent> {
  const { userAttributes } = event.request;
  const clientId = event.callerContext.clientId;

  logger.info('Post-confirmation trigger', {
    userId: userAttributes['sub'],
    email: userAttributes['email'],
    clientId,
  });

  // Determine role from the app client ID
  const role = resolveRole(clientId);
  const now = new Date().toISOString();

  const user: User = {
    userId: userAttributes['sub'] ?? '',
    email: userAttributes['email'] ?? '',
    firstName: userAttributes['given_name'] ?? '',
    lastName: userAttributes['family_name'] ?? '',
    phone: userAttributes['phone_number'],
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await users.create(user);

  logger.info('User created in DynamoDB', {
    userId: user.userId,
    role: user.role,
  });

  return event;
}

function resolveRole(clientId: string): UserRole {
  // The CDK stack sets these env vars to map client IDs to roles
  const consumerClientId = process.env['CONSUMER_CLIENT_ID'];
  const repairerClientId = process.env['REPAIRER_CLIENT_ID'];
  const adminClientId = process.env['ADMIN_CLIENT_ID'];

  if (clientId === repairerClientId) return 'REPAIRER';
  if (clientId === adminClientId) return 'ADMIN';
  if (clientId === consumerClientId) return 'CONSUMER';

  // Default to consumer for unknown clients
  return 'CONSUMER';
}
