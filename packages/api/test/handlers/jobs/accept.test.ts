import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Mock repositories.
const mockJobsGetById = vi.fn();
const mockJobsAcceptJob = vi.fn();
const mockJobsSetMatchFeeInvoiceItem = vi.fn();
const mockCasesUpdateStatus = vi.fn();
const mockUsersGetById = vi.fn();

vi.mock('@corexpert/db', () => ({
  JobsRepository: class {
    getById = mockJobsGetById;
    acceptJob = mockJobsAcceptJob;
    setMatchFeeInvoiceItem = mockJobsSetMatchFeeInvoiceItem;
  },
  CasesRepository: class {
    updateStatus = mockCasesUpdateStatus;
  },
  UsersRepository: class {
    getById = mockUsersGetById;
  },
  OrganisationsRepository: class {
    getById = vi.fn();
  },
  NetworkLinksRepository: class {
    enabledCompaniesForOrg = vi.fn().mockResolvedValue([]);
  },
}));

// Mock matching lib — resolveMatchTarget returns a fully-matched target.
const mockResolveMatchTarget = vi.fn();
vi.mock('../../../src/lib/matching', () => ({
  resolveMatchTarget: (...args: unknown[]) => mockResolveMatchTarget(...args),
  jobToMatchInput: (job: Record<string, unknown>) => ({
    postcode: (job['location'] as Record<string, unknown> | undefined)?.['postcode'] ?? '',
    repairMethods: job['repairMethods'] ?? [],
  }),
}));

// Mock Stripe — always succeeds.
vi.mock('../../../src/lib/stripe', () => ({
  createMatchFeeInvoiceItem: vi.fn().mockResolvedValue('ii_test_123'),
}));

const { handler: rawHandler } = await import('../../../src/handlers/jobs/accept');

/** Wrap handler to always return the structured result shape (tests never produce string responses). */
async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return await rawHandler(event) as APIGatewayProxyStructuredResultV2;
}

function makeEvent(overrides?: { userId?: string; jobId?: string }): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: overrides?.userId ?? 'repairer-1',
            email: 'rep@example.com',
            'cognito:groups': ['repairers'],
          },
        },
      },
    },
    pathParameters: { jobId: overrides?.jobId ?? 'job-1' },
    headers: {},
    body: null,
  } as unknown as APIGatewayProxyEventV2;
}

const baseRepairer = {
  userId: 'repairer-1',
  organisationId: 'org-1',
  repairer: {
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_test_123',
  },
};

const baseJob = {
  jobId: 'job-1',
  caseId: 'case-1',
  status: 'OPEN',
  location: { postcode: 'SW1A 1AA' },
  repairMethods: ['REPAIR'],
  introductionFee: 2500,
  vehicleSummary: { make: 'BMW', model: '3 Series' },
};

describe('POST /jobs/{jobId}/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a job for a matched repairer with active subscription', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue(baseJob);
    mockResolveMatchTarget.mockResolvedValue({
      organisationId: 'org-1',
      status: 'ACTIVE',
      capability: { vehicleSizes: [], repairMethods: ['REPAIR'], coverageAreas: ['SW'] },
      enabledNetworks: [],
    });
    mockJobsAcceptJob.mockResolvedValue(true);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.data.accepted).toBe(true);
    expect(body.data.matchFee).toBe(2500);
  });

  it('returns 403 when repairer has no active subscription', async () => {
    mockUsersGetById.mockResolvedValue({
      ...baseRepairer,
      repairer: { ...baseRepairer.repairer, subscriptionStatus: 'canceled' },
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain('subscription');
  });

  it('returns 404 when job does not exist', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue(undefined);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('returns 409 when job has expired', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue({
      ...baseJob,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain('expired');
  });

  it('returns 403 when repairer does not match the job', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue(baseJob);
    mockResolveMatchTarget.mockResolvedValue({
      organisationId: 'org-1',
      status: 'ACTIVE',
      capability: { vehicleSizes: [], repairMethods: ['PDR'], coverageAreas: ['M'] },
      enabledNetworks: [],
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain('not available');
  });

  it('returns 409 when job already accepted (race condition)', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue(baseJob);
    mockResolveMatchTarget.mockResolvedValue({
      organisationId: 'org-1',
      status: 'ACTIVE',
      capability: { vehicleSizes: [], repairMethods: ['REPAIR'], coverageAreas: ['SW'] },
      enabledNetworks: [],
    });
    mockJobsAcceptJob.mockResolvedValue(false); // conditional write failed

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body as string);
    expect(body.error.message).toContain('already been accepted');
  });

  it('still accepts when match fee accrual fails (best-effort)', async () => {
    mockUsersGetById.mockResolvedValue(baseRepairer);
    mockJobsGetById.mockResolvedValue(baseJob);
    mockResolveMatchTarget.mockResolvedValue({
      organisationId: 'org-1',
      status: 'ACTIVE',
      capability: { vehicleSizes: [], repairMethods: ['REPAIR'], coverageAreas: ['SW'] },
      enabledNetworks: [],
    });
    mockJobsAcceptJob.mockResolvedValue(true);

    // Make Stripe fail
    const { createMatchFeeInvoiceItem } = await import('../../../src/lib/stripe');
    vi.mocked(createMatchFeeInvoiceItem).mockRejectedValueOnce(new Error('Stripe down'));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.data.accepted).toBe(true);
  });

  it('returns 403 when called by a consumer', async () => {
    const event = {
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'user-1', email: 'c@e.com', 'cognito:groups': ['consumers'] } } },
      },
      pathParameters: { jobId: 'job-1' },
      headers: {},
      body: null,
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });
});
