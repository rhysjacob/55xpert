import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const mockGetById = vi.fn();
const mockMarkSiteAllocationRequested = vi.fn();

vi.mock('@corexpert/db', () => ({
  CasesRepository: class {
    getById = mockGetById;
    markSiteAllocationRequested = mockMarkSiteAllocationRequested;
  },
}));

const mockEmitDomainEvent = vi.fn();
vi.mock('../../../src/lib/events', () => ({
  emitDomainEvent: (...args: unknown[]) => mockEmitDomainEvent(...args),
  DomainEvent: { CASE_SITE_ALLOCATION_REQUESTED: 'case.site-allocation.requested' },
}));

const { handler: rawHandler } = await import('../../../src/handlers/cases/request-site-allocation');

async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await rawHandler(event)) as APIGatewayProxyStructuredResultV2;
}

function makeEvent(overrides?: { userId?: string; groups?: string[] }): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: overrides?.userId ?? 'consumer-1',
            email: 'c@example.com',
            'cognito:groups': overrides?.groups ?? ['consumers'],
          },
        },
      },
    },
    pathParameters: { caseId: 'case-1' },
  } as unknown as APIGatewayProxyEventV2;
}

function referredCase(overrides?: Record<string, unknown>) {
  return {
    caseId: 'case-1',
    userId: 'consumer-1',
    referenceNo: 'CX-1',
    status: 'XPERT_REVIEW',
    warrantyCompanyId: 'wc-1',
    triageResult: { eligibility: { verdict: 'REFER', reasons: [] } },
    ...overrides,
  };
}

describe('POST /cases/{caseId}/site-allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSiteAllocationRequested.mockResolvedValue('2026-08-13T10:00:00.000Z');
  });

  it('records the request and alerts the company', async () => {
    mockGetById.mockResolvedValue(referredCase());

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).data.siteAllocationRequestedAt).toBe('2026-08-13T10:00:00.000Z');
    expect(mockMarkSiteAllocationRequested).toHaveBeenCalledWith('case-1');
    expect(mockEmitDomainEvent).toHaveBeenCalledWith('case.site-allocation.requested', {
      caseId: 'case-1',
    });
  });

  it('does not alert twice when already requested', async () => {
    mockGetById.mockResolvedValue(
      referredCase({ siteAllocationRequestedAt: '2026-08-01T09:00:00.000Z' }),
    );
    mockMarkSiteAllocationRequested.mockResolvedValue('2026-08-01T09:00:00.000Z');

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).data.siteAllocationRequestedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(mockEmitDomainEvent).not.toHaveBeenCalled();
  });

  it('rejects a case that was not referred', async () => {
    mockGetById.mockResolvedValue(
      referredCase({ triageResult: { eligibility: { verdict: 'ELIGIBLE', reasons: [] } } }),
    );

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(400);
    expect(mockEmitDomainEvent).not.toHaveBeenCalled();
  });

  it("rejects another consumer's case", async () => {
    mockGetById.mockResolvedValue(referredCase({ userId: 'someone-else' }));

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(403);
    expect(mockMarkSiteAllocationRequested).not.toHaveBeenCalled();
  });

  it('rejects a non-consumer', async () => {
    const res = await handler(makeEvent({ groups: ['repairers'] }));

    expect(res.statusCode).toBe(403);
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('404s an unknown case', async () => {
    mockGetById.mockResolvedValue(undefined);

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(404);
  });
});
