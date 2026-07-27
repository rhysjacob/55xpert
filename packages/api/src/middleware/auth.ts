import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { AuthContext, UserRole } from '@corexpert/core';
import { UnauthorizedError, ForbiddenError } from '@corexpert/core';

interface CognitoClaims {
  sub: string;
  email: string;
  'cognito:groups'?: string[];
  warrantyCompanyId?: string;
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
  // API Gateway v2's JWT authorizer serializes multi-valued claims as a
  // bracketed, space-separated string (e.g. "[consumers repairers]"), not a
  // JSON array or comma list. Normalise all three shapes here.
  const parsedGroups = Array.isArray(groups)
    ? (groups as string[])
    : typeof groups === 'string'
      ? groups.replace(/^\[|\]$/g, '').split(/[\s,]+/).map((g) => g.trim()).filter(Boolean)
      : [];

  const warrantyCompanyId = claims['custom:warrantyCompanyId'];
  return {
    sub,
    email,
    'cognito:groups': parsedGroups,
    ...(typeof warrantyCompanyId === 'string' && warrantyCompanyId ? { warrantyCompanyId } : {}),
  };
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
    ...(claims.warrantyCompanyId ? { warrantyCompanyId: claims.warrantyCompanyId } : {}),
  };
}

/**
 * Central tenant scope (TRX-77). Returns the `warrantyCompanyId` that a user's
 * queries must be restricted to, or `null` to see across all tenants.
 *
 * ADMIN and XPERT bypass the scope (full cross-company visibility — the stated
 * requirement). A company-facing user is confined to their own tenant. Consumers
 * and repairers carry no tenant (they're scoped by ownership / the matching
 * engine instead), so they also return null here.
 */
export function tenantScope(auth: AuthContext): string | null {
  if (auth.roles.includes('ADMIN') || auth.roles.includes('XPERT')) return null;
  return auth.warrantyCompanyId ?? null;
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
