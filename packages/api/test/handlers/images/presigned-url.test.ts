import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Mock the CasesRepository before importing the handler.
const mockGetById = vi.fn();
vi.mock('@corexpert/db', () => ({
  CasesRepository: class {
    getById = mockGetById;
  },
}));

// Mock S3 presigned URL generation.
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {},
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

// Set required env before importing handler.
process.env['IMAGE_BUCKET'] = 'test-bucket';

const { handler: rawHandler } = await import('../../../src/handlers/images/presigned-url');

async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return await rawHandler(event) as APIGatewayProxyStructuredResultV2;
}

function makeEvent(overrides: {
  userId?: string;
  role?: string;
  caseId?: string;
  body?: unknown;
}): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: overrides.userId ?? 'user-1',
            email: 'test@example.com',
            'cognito:groups': [overrides.role ?? 'consumers'],
          },
        },
      },
    },
    pathParameters: { caseId: overrides.caseId ?? 'case-1' },
    body: JSON.stringify(overrides.body ?? {
      imageType: 'DAMAGE_ANGLE_1',
      mimeType: 'image/jpeg',
      originalFilename: 'photo.jpg',
    }),
    headers: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('POST /cases/{caseId}/images/presigned-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns presigned URL for the case owner', async () => {
    mockGetById.mockResolvedValue({ caseId: 'case-1', userId: 'user-1' });
    const event = makeEvent({ userId: 'user-1', caseId: 'case-1' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toBe('https://s3.example.com/presigned');
    expect(body.data.s3Bucket).toBe('test-bucket');
  });

  it('returns 403 when user does not own the case', async () => {
    mockGetById.mockResolvedValue({ caseId: 'case-1', userId: 'other-user' });
    const event = makeEvent({ userId: 'user-1', caseId: 'case-1' });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when case does not exist', async () => {
    mockGetById.mockResolvedValue(undefined);
    const event = makeEvent({ userId: 'user-1', caseId: 'nonexistent' });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body as string);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 when caller is a repairer', async () => {
    mockGetById.mockResolvedValue({ caseId: 'case-1', userId: 'user-1' });
    const event = makeEvent({ userId: 'user-1', caseId: 'case-1', role: 'repairers' });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('returns 400 for invalid mimeType', async () => {
    mockGetById.mockResolvedValue({ caseId: 'case-1', userId: 'user-1' });
    const event = makeEvent({
      userId: 'user-1',
      caseId: 'case-1',
      body: { imageType: 'DAMAGE_ANGLE_1', mimeType: 'text/plain', originalFilename: 'x.txt' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});
