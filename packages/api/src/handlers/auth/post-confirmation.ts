import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { UsersRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import type { User, UserRole } from '@corexpert/core';

const users = new UsersRepository();
const cognito = new CognitoIdentityProviderClient({});

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

  // Determine role from the app client that initiated the signup.
  // The client name encodes the role (e.g. corexpert-dev-repairer), so we
  // look it up at runtime — this keeps the Lambda free of any compile-time
  // reference to the user pool / clients, avoiding a CloudFormation cycle.
  const role = await resolveRole(event.userPoolId, clientId);
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

  // Add the user to the Cognito group matching their role. The API authorizes
  // requests from the `cognito:groups` claim, so without this membership the
  // user's token carries no role and every role-guarded route returns 403.
  const groupName = ROLE_TO_GROUP[role];
  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: groupName,
      }),
    );
    logger.info('User added to Cognito group', { userId: user.userId, groupName });
  } catch (err) {
    logger.error('Failed to add user to Cognito group', { userId: user.userId, groupName, err });
  }

  return event;
}

const ROLE_TO_GROUP: Record<UserRole, string> = {
  CONSUMER: 'consumers',
  REPAIRER: 'repairers',
  XPERT: 'xperts',
  ADMIN: 'admins',
};

async function resolveRole(userPoolId: string, clientId: string): Promise<UserRole> {
  // The app client name encodes the role (corexpert-{stage}-{role}).
  // Look it up rather than relying on injected client-ID env vars, which
  // would create a UserPool -> Lambda -> Client -> UserPool dependency cycle.
  try {
    const { UserPoolClient } = await cognito.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }),
    );
    const name = UserPoolClient?.ClientName ?? '';
    if (name.endsWith('-repairer')) return 'REPAIRER';
    if (name.endsWith('-admin')) return 'ADMIN';
    if (name.endsWith('-consumer')) return 'CONSUMER';
  } catch (err) {
    logger.error('Failed to resolve client name for role', { clientId, err });
  }

  // Default to consumer for unknown clients
  return 'CONSUMER';
}
