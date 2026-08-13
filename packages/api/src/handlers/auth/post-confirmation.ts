import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import { UsersRepository, OrganisationsRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import { createStripeCustomer } from '../../lib/stripe';
import { outwardCode, normalisePostcode } from '@corexpert/core';
import type { User, UserRole, RepairerProfile, RepairerOrganisation } from '@corexpert/core';
import { geocodePostcode } from '../../lib/geocode';

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
  const clientName = await resolveClientName(event.userPoolId, clientId);
  const role = roleFromClientName(clientName);
  const warrantyCompanyId = tenantFromClientName(clientName);
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

    // Geocode the postcode once (best-effort) for distance-based matching.
    const coords = postcode ? await geocodePostcode(postcode) : null;
    if (coords) {
      repairer.lat = coords.lat;
      repairer.lng = coords.lng;
    }

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
            ...(coords ? { baseLat: coords.lat, baseLng: coords.lng } : {}),
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
    ...(warrantyCompanyId ? { warrantyCompanyId } : {}),
    ...(repairer ? { repairer } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await users.create(user);

  logger.info('User created in DynamoDB', {
    userId: user.userId,
    role: user.role,
    ...(warrantyCompanyId ? { warrantyCompanyId } : {}),
  });

  // Mirror the tenant onto the Cognito user so it appears in the JWT as
  // custom:warrantyCompanyId — that claim is what the API trusts when stamping
  // a case, and it cannot be forged by the browser. Best-effort: a failure here
  // must not fail confirmation, but it does mean the user falls back to the
  // default tenant until repaired, so it is logged as an error.
  if (warrantyCompanyId) {
    try {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: event.userPoolId,
          Username: event.userName,
          UserAttributes: [{ Name: 'custom:warrantyCompanyId', Value: warrantyCompanyId }],
        }),
      );
      logger.info('Tenant stamped on Cognito user', { userId, warrantyCompanyId });
    } catch (err) {
      logger.error('Failed to stamp tenant on Cognito user', {
        userId,
        warrantyCompanyId,
        err: String(err),
      });
    }
  }

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

async function resolveClientName(userPoolId: string, clientId: string): Promise<string> {
  // The app client name encodes the role (corexpert-{stage}-{role}) and, for a
  // white-label portal, the brand (corexpert-{stage}-consumer-{brand}).
  // Look it up rather than relying on injected client-ID env vars, which
  // would create a UserPool -> Lambda -> Client -> UserPool dependency cycle.
  try {
    const { UserPoolClient } = await cognito.send(
      new DescribeUserPoolClientCommand({ UserPoolId: userPoolId, ClientId: clientId }),
    );
    return UserPoolClient?.ClientName ?? '';
  } catch (err) {
    logger.error('Failed to resolve client name', { clientId, err });
    return '';
  }
}

function roleFromClientName(name: string): UserRole {
  if (name.endsWith('-repairer')) return 'REPAIRER';
  if (name.endsWith('-admin')) return 'ADMIN';
  // Both `-consumer` and the white-label `-consumer-{brand}` clients.
  if (name.includes('-consumer')) return 'CONSUMER';

  // Default to consumer for unknown clients
  return 'CONSUMER';
}

/**
 * The tenant that owns cases submitted through this portal, or undefined for
 * the default (non-white-label) consumer client. The brand -> tenant map is
 * server-side config: the client only proves *which portal* the signup came
 * from, never which tenant it may claim.
 */
function tenantFromClientName(name: string): string | undefined {
  const match = /-consumer-(.+)$/.exec(name);
  if (!match?.[1]) return undefined;

  const brand = match[1];
  let map: Record<string, string>;
  try {
    map = JSON.parse(process.env['WHITE_LABEL_TENANTS'] ?? '{}') as Record<string, string>;
  } catch (err) {
    logger.error('WHITE_LABEL_TENANTS is not valid JSON', { err });
    return undefined;
  }

  const tenantId = map[brand];
  if (!tenantId) {
    // A client exists for a brand with no tenant mapped. Falling through to the
    // default tenant would silently file this client's cases in the wrong
    // network, so make the misconfiguration loud.
    logger.error('No tenant mapped for white-label brand', { brand, clientName: name });
    return undefined;
  }
  return tenantId;
}
