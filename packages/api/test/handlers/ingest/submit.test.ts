import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Mock repositories.
const mockCasesCreate = vi.fn();
const mockCasesUpdateStatus = vi.fn();
const mockIngestionsClaim = vi.fn();
const mockIngestionsGet = vi.fn();
const mockIngestionsSetStatus = vi.fn();

vi.mock('@corexpert/db', () => ({
  CasesRepository: class {
    create = mockCasesCreate;
    updateStatus = mockCasesUpdateStatus;
  },
  IngestionsRepository: class {
    claim = mockIngestionsClaim;
    get = mockIngestionsGet;
    setStatus = mockIngestionsSetStatus;
  },
  WarrantyCompaniesRepository: class {
    getByIngestKeyHash = vi.fn();
    getById = vi.fn();
  },
}));

// Mock ingest-auth: controls which company is resolved.
const mockAuthenticateIngest = vi.fn();
vi.mock('../../../src/lib/ingest-auth', () => ({
  authenticateIngest: (...args: unknown[]) => mockAuthenticateIngest(...args),
}));

// Mock warranty-notify (no-op).
vi.mock('../../../src/lib/warranty-notify', () => ({
  notifyWarrantyCompany: vi.fn().mockResolvedValue(undefined),
}));

// Mock Lambda client (triage invocation).
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = vi.fn().mockResolvedValue({});
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
  InvocationType: { Event: 'Event' },
}));

process.env['IMAGE_BUCKET'] = 'test-images-bucket';
process.env['TRIAGE_WORKER_FUNCTION'] = 'triage-worker-fn';

const { handler: rawHandler } = await import('../../../src/handlers/ingest/submit');

async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return await rawHandler(event) as APIGatewayProxyStructuredResultV2;
}

const activeCompany = {
  warrantyCompanyId: 'wc-1',
  name: 'Test Co',
  status: 'ACTIVE',
};

function makeEvent(overrides?: { apiKey?: string; body?: unknown }): APIGatewayProxyEventV2 {
  return {
    headers: { 'x-api-key': overrides?.apiKey ?? 'rxk_valid_key' },
    body: JSON.stringify(overrides?.body ?? {
      externalRef: 'EXT-001',
      postcode: 'SW1A 2AA',
      vehicle: { registrationNo: 'AB12 CDE', make: 'Ford', model: 'Focus' },
      images: [
        { imageType: 'REGISTRATION_PLATE', s3Key: 'cases/x/plate.jpg', s3Bucket: 'test-images-bucket' },
        { imageType: 'DAMAGE_ANGLE_1', s3Key: 'cases/x/d1.jpg', s3Bucket: 'test-images-bucket' },
        { imageType: 'DAMAGE_ANGLE_2', s3Key: 'cases/x/d2.jpg', s3Bucket: 'test-images-bucket' },
        { imageType: 'DAMAGE_ANGLE_3', s3Key: 'cases/x/d3.jpg', s3Bucket: 'test-images-bucket' },
      ],
    }),
    requestContext: {},
    pathParameters: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('POST /ingest/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when API key is missing', async () => {
    const { UnauthorizedError } = await import('@corexpert/core');
    mockAuthenticateIngest.mockRejectedValue(new UnauthorizedError('Missing x-api-key'));

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when API key is invalid', async () => {
    const { UnauthorizedError } = await import('@corexpert/core');
    mockAuthenticateIngest.mockRejectedValue(new UnauthorizedError('Invalid API key'));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when company is inactive', async () => {
    const { UnauthorizedError } = await import('@corexpert/core');
    mockAuthenticateIngest.mockRejectedValue(new UnauthorizedError('Warranty company is not active'));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns duplicate response for repeated externalRef', async () => {
    mockAuthenticateIngest.mockResolvedValue(activeCompany);
    mockIngestionsClaim.mockResolvedValue(false); // already claimed
    mockIngestionsGet.mockResolvedValue({
      warrantyCompanyId: 'wc-1',
      externalRef: 'EXT-001',
      status: 'ACCEPTED',
      caseId: 'existing-case-id',
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.data.duplicate).toBe(true);
    expect(body.data.caseId).toBe('existing-case-id');
  });

  it('rejects images referencing wrong bucket', async () => {
    mockAuthenticateIngest.mockResolvedValue(activeCompany);
    mockIngestionsClaim.mockResolvedValue(true);

    const result = await handler(makeEvent({
      body: {
        externalRef: 'EXT-002',
        postcode: 'SW1A 2AA',
        vehicle: { make: 'Ford' },
        images: [
          { imageType: 'REGISTRATION_PLATE', s3Key: 'x.jpg', s3Bucket: 'attacker-bucket' },
          { imageType: 'DAMAGE_ANGLE_1', s3Key: 'y.jpg', s3Bucket: 'attacker-bucket' },
          { imageType: 'DAMAGE_ANGLE_2', s3Key: 'z.jpg', s3Bucket: 'attacker-bucket' },
          { imageType: 'DAMAGE_ANGLE_3', s3Key: 'w.jpg', s3Bucket: 'attacker-bucket' },
        ],
      },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.data.status).toBe('REJECTED');
    expect(body.data.reason).toBe('MISSING_FIELDS');
  });

  it('accepts a valid ingestion and creates a case', async () => {
    mockAuthenticateIngest.mockResolvedValue(activeCompany);
    mockIngestionsClaim.mockResolvedValue(true);
    mockCasesCreate.mockResolvedValue(undefined);
    mockIngestionsSetStatus.mockResolvedValue(undefined);
    mockCasesUpdateStatus.mockResolvedValue(undefined);

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.data.status).toBe('ACCEPTED');
    expect(body.data.caseId).toBeDefined();
    expect(mockCasesCreate).toHaveBeenCalledOnce();
  });

  it('returns 400 for invalid body (missing postcode)', async () => {
    mockAuthenticateIngest.mockResolvedValue(activeCompany);

    const result = await handler(makeEvent({
      body: {
        externalRef: 'EXT-003',
        // missing postcode
        vehicle: { make: 'Ford' },
        images: [],
      },
    }));

    expect(result.statusCode).toBe(400);
  });
});
