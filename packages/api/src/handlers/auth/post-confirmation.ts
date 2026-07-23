import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import { UsersRepository, OrganisationsRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import { createStripeCustomer } from '../../lib/stripe';
import { outwardCode, normalisePostcode } from '@corexpert/core';
import type { User, UserRole, RepairerProfile, RepairerOrganisation } from '@corexpert/core';

const users = new UsersRepository();
const orgs = new OrganisationsRepository();
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

  const userId = userAttributes['sub'] ?? '';
  const email = userAttributes['email'] ?? '';
  const firstName = userAttributes['given_name'] ?? '';
  const lastName = userAttributes['family_name'] ?? '';

  // Repairers get a profile seeded from the sign-up form plus a Stripe Customer
  // — the anchor for their subscription, saved card and invoicing. Customer
  // creation is best-effort: a Stripe hiccup must never fail account
  // confirmation, so on failure we still provision the user (a later checkout/
  // subscription step backfills the customer).
  let repairer: RepairerProfile | undefined;
  let organisationId: string | undefined;
  if (role === 'REPAIRER') {
    const businessName = userAttributes['custom:business_name'] ?? '';
    repairer = { businessName, isVerified: false };
    const postcode = userAttributes['custom:postcode'];
    if (postcode) repairer.postcode = postcode;

    // Resolve the organisation (TRX-37/44/49/52). An invited member carries the
    // org id (set by the invite flow) and joins it; a self-signup is a new
    // business owner, so we create a PENDING org awaiting admin approval. Both
    // are best-effort — an org hiccup must not fail account confirmation.
    const invitedOrgId = userAttributes['custom:organisation_id'];
    try {
      if (invitedOrgId) {
        organisationId = invitedOrgId;
      } else {
        organisationId = randomUUID();
        const org: RepairerOrganisation = {
          organisationId,
          name: businessName || email,
          status: 'PENDING',
          capability: {
            vehicleSizes: [],
            repairMethods: [],
            coverageAreas: postcode ? [outwardCode(postcode)] : [],
            ...(postcode ? { basePostcode: normalisePostcode(postcode) } : {}),
          },
          primaryContactUserId: userId,
          createdAt: now,
          updatedAt: now,
        };
        await orgs.create(org);
        logger.info('Repairer organisation created', { userId, organisationId });
      }
    } catch (err) {
      logger.error('Organisation provisioning failed; user still created', { userId, err: String(err) });
      organisationId = invitedOrgId ?? undefined;
    }

    try {
      const customerId = await createStripeCustomer({
        email,
        name: businessName || `${firstName} ${lastName}`.trim() || email,
        metadata: { userId, ...(businessName ? { businessName } : {}) },
      });
      repairer.stripeCustomerId = customerId;
      logger.info('Stripe customer created for repairer', { userId, customerId });
    } catch (err) {
      logger.error('Stripe customer creation failed; will backfill later', { userId, err: String(err) });
    }
  }

  const user: User = {
    userId,
    email,
    firstName,
    lastName,
    phone: userAttributes['phone_number'],
    role,
    isActive: true,
    ...(organisationId ? { organisationId } : {}),
    ...(repairer ? { repairer } : {}),
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
