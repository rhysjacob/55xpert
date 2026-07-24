import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { UsersRepository, OrganisationsRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '@corexpert/core';
import type { User } from '@corexpert/core';

const users = new UsersRepository();
const orgs = new OrganisationsRepository();
const cognito = new CognitoIdentityProviderClient({});

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
});

/**
 * Invite a teammate into the caller's repairer organisation (TRX-52). The org's
 * primary contact adds a member by email: Cognito creates the login (with the
 * org id stamped as a custom attribute and a temporary password emailed), then
 * we create the linked user record and add them to the repairers group.
 *
 * We provision the DynamoDB record here rather than in the post-confirmation
 * trigger because admin-created users don't fire post-confirmation — they set a
 * password via the force-change challenge, which is not a sign-up confirmation.
 */
async function inviteHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const inviter = await users.getById(auth.userId);
  if (!inviter?.organisationId) throw new NotFoundError('Organisation for repairer', auth.userId);
  const org = await orgs.getById(inviter.organisationId);
  if (!org) throw new NotFoundError('Organisation', inviter.organisationId);
  // Only the org's primary contact may invite — keeps user creation controlled.
  if (org.primaryContactUserId !== auth.userId) {
    throw new ForbiddenError('Only the organisation primary contact can invite members');
  }

  const body = parseBody(event, inviteSchema);
  const userPoolId = process.env['USER_POOL_ID'];
  if (!userPoolId) throw new ValidationError('User pool is not configured');

  // Guard against re-inviting an existing user.
  const existing = await users.getByEmail(body.email);
  if (existing) throw new ConflictError(`A user with email ${body.email} already exists`);

  let sub: string;
  try {
    const result = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: body.email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email', Value: body.email },
          { Name: 'email_verified', Value: 'true' },
          ...(body.firstName ? [{ Name: 'given_name', Value: body.firstName }] : []),
          ...(body.lastName ? [{ Name: 'family_name', Value: body.lastName }] : []),
          { Name: 'custom:organisation_id', Value: org.organisationId },
          { Name: 'custom:business_name', Value: org.name },
        ],
      }),
    );
    sub = result.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';
    if (!sub) throw new Error('Cognito did not return a sub for the new user');
    await cognito.send(
      new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: body.email, GroupName: 'repairers' }),
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'UsernameExistsException') {
      throw new ConflictError(`A login for ${body.email} already exists`);
    }
    throw err;
  }

  const now = new Date().toISOString();
  const member: User = {
    userId: sub,
    email: body.email,
    ...(body.firstName ? { firstName: body.firstName } : {}),
    ...(body.lastName ? { lastName: body.lastName } : {}),
    role: 'REPAIRER',
    isActive: true,
    organisationId: org.organisationId,
    // Members share the org's capability/coverage; their own profile is minimal.
    repairer: { businessName: org.name, isVerified: false },
    createdAt: now,
    updatedAt: now,
  };
  await users.create(member);

  logger.info('Repairer member invited', { organisationId: org.organisationId, invitedUserId: sub, by: auth.userId });
  return ok({ userId: sub, email: body.email, organisationId: org.organisationId, status: 'INVITED' });
}

export const handler = withErrorHandler(inviteHandler);
