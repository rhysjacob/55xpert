import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthContext, UserRole } from '@corexpert/core';
import { UnauthorizedError, ForbiddenError } from '@corexpert/core';

interface CognitoClaims {
  sub: string;
  email: string;
  'cognito:groups'?: string[];
}

function parseCognitoClaims(event: APIGatewayProxyEventV2): CognitoClaims {
  const authContext = (event.requestContext as unknown as Record<string, unknown>)?.['authorizer'] as Record<string, unknown> | undefined;
  if (!authContext) {
    throw new UnauthorizedError('No authorization context');
  }

  // API Gateway v2 JWT authorizer puts claims in authorizer.jwt.claims
  const jwt = authContext['jwt'] as
    | { claims: Record<string, unknown> }
    | undefined;

  if (!jwt?.claims) {
    throw new UnauthorizedError('Invalid JWT claims');
  }

  const claims = jwt.claims;
  const sub = claims['sub'] as string | undefined;
  const email = claims['email'] as string | undefined;

  if (!sub || !email) {
    throw new UnauthorizedError('Missing required claims');
  }

  const groups = claims['cognito:groups'];
  const parsedGroups = typeof groups === 'string'
    ? groups.split(',').map((g) => g.trim())
    : Array.isArray(groups)
      ? (groups as string[])
      : [];

  return { sub, email, 'cognito:groups': parsedGroups };
}

/** Map Cognito group names to UserRole values. */
function groupToRole(group: string): UserRole | undefined {
  const mapping: Record<string, UserRole> = {
    consumers: 'CONSUMER',
    repairers: 'REPAIRER',
    xperts: 'XPERT',
    admins: 'ADMIN',
  };
  return mapping[group];
}

/** Extract auth context from the API Gateway event. */
export function getAuthContext(event: APIGatewayProxyEventV2): AuthContext {
  const claims = parseCognitoClaims(event);
  const groups = claims['cognito:groups'] ?? [];
  const roles = groups
    .map(groupToRole)
    .filter((r): r is UserRole => r !== undefined);

  return {
    userId: claims.sub,
    email: claims.email,
    roles,
  };
}

/** Require specific roles. Throws ForbiddenError if user doesn't have any of the required roles. */
export function requireRole(auth: AuthContext, ...requiredRoles: UserRole[]): void {
  const hasRole = requiredRoles.some((role) => auth.roles.includes(role));
  if (!hasRole) {
    throw new ForbiddenError(
      `Requires one of: ${requiredRoles.join(', ')}`,
    );
  }
}
