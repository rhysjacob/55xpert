import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getAuthContext, requireRole, tenantScope } from '../../src/middleware/auth';
import { UnauthorizedError, ForbiddenError } from '@corexpert/core';

/** Build a minimal API Gateway v2 event with JWT authorizer claims. */
function makeEvent(claims: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe('getAuthContext', () => {
  it('extracts userId, email, and roles from standard claims', () => {
    const event = makeEvent({
      sub: 'user-123',
      email: 'test@example.com',
      'cognito:groups': ['consumers'],
    });
    const auth = getAuthContext(event);
    expect(auth.userId).toBe('user-123');
    expect(auth.email).toBe('test@example.com');
    expect(auth.roles).toEqual(['CONSUMER']);
  });

  it('handles bracketed space-separated group string from API Gateway v2', () => {
    const event = makeEvent({
      sub: 'user-456',
      email: 'admin@example.com',
      'cognito:groups': '[admins xperts]',
    });
    const auth = getAuthContext(event);
    expect(auth.roles).toEqual(['ADMIN', 'XPERT']);
  });

  it('handles comma-separated group string', () => {
    const event = makeEvent({
      sub: 'user-789',
      email: 'multi@example.com',
      'cognito:groups': 'repairers,admins',
    });
    const auth = getAuthContext(event);
    expect(auth.roles).toEqual(['REPAIRER', 'ADMIN']);
  });

  it('handles array of groups', () => {
    const event = makeEvent({
      sub: 'user-abc',
      email: 'array@example.com',
      'cognito:groups': ['repairers', 'xperts'],
    });
    const auth = getAuthContext(event);
    expect(auth.roles).toEqual(['REPAIRER', 'XPERT']);
  });

  it('returns empty roles when no groups claim', () => {
    const event = makeEvent({
      sub: 'user-no-groups',
      email: 'none@example.com',
    });
    const auth = getAuthContext(event);
    expect(auth.roles).toEqual([]);
  });

  it('ignores unknown group names', () => {
    const event = makeEvent({
      sub: 'user-unknown',
      email: 'unknown@example.com',
      'cognito:groups': ['consumers', 'nonexistent'],
    });
    const auth = getAuthContext(event);
    expect(auth.roles).toEqual(['CONSUMER']);
  });

  it('extracts warrantyCompanyId from custom claim', () => {
    const event = makeEvent({
      sub: 'user-wc',
      email: 'wc@example.com',
      'cognito:groups': ['admins'],
      'custom:warrantyCompanyId': 'wc-123',
    });
    const auth = getAuthContext(event);
    expect(auth.warrantyCompanyId).toBe('wc-123');
  });

  it('throws UnauthorizedError when no authorizer context', () => {
    const event = { requestContext: {} } as unknown as APIGatewayProxyEventV2;
    expect(() => getAuthContext(event)).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when claims are missing sub', () => {
    const event = makeEvent({ email: 'no-sub@example.com' });
    expect(() => getAuthContext(event)).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when claims are missing email', () => {
    const event = makeEvent({ sub: 'user-no-email' });
    expect(() => getAuthContext(event)).toThrow(UnauthorizedError);
  });
});

describe('requireRole', () => {
  it('passes when user has the required role', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['CONSUMER' as const] };
    expect(() => requireRole(auth, 'CONSUMER')).not.toThrow();
  });

  it('passes when user has any of multiple required roles', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['XPERT' as const] };
    expect(() => requireRole(auth, 'ADMIN', 'XPERT')).not.toThrow();
  });

  it('throws ForbiddenError when user lacks the required role', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['CONSUMER' as const] };
    expect(() => requireRole(auth, 'ADMIN')).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when user has no roles', () => {
    const auth = { userId: 'u1', email: 'e', roles: [] as string[] };
    expect(() => requireRole(auth, 'REPAIRER')).toThrow(ForbiddenError);
  });
});

describe('tenantScope', () => {
  it('returns null for ADMIN (cross-tenant visibility)', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['ADMIN' as const], warrantyCompanyId: 'wc-1' };
    expect(tenantScope(auth)).toBeNull();
  });

  it('returns null for XPERT (cross-tenant visibility)', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['XPERT' as const], warrantyCompanyId: 'wc-1' };
    expect(tenantScope(auth)).toBeNull();
  });

  it('returns warrantyCompanyId for a company-facing user', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['CONSUMER' as const], warrantyCompanyId: 'wc-2' };
    expect(tenantScope(auth)).toBe('wc-2');
  });

  it('returns null for a user without warrantyCompanyId', () => {
    const auth = { userId: 'u1', email: 'e', roles: ['REPAIRER' as const] };
    expect(tenantScope(auth)).toBeNull();
  });
});
