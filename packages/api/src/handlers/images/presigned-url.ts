import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { ValidationError } from '@corexpert/core';

const BUCKET = process.env['IMAGE_BUCKET'] ?? '';
const PRESIGN_EXPIRY = 300; // 5 minutes

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const presignSchema = z.object({
  imageType: z.enum([
    'REGISTRATION_PLATE',
    'DAMAGE_ANGLE_1',
    'DAMAGE_ANGLE_2',
    'DAMAGE_ANGLE_3',
  ]),
  mimeType: z.string().refine(
    (v) => ALLOWED_MIME_TYPES.includes(v),
    { message: `Must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` },
  ),
  originalFilename: z.string().min(1).max(255),
});

const s3 = new S3Client({});

async function presignedUrlHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  const caseId = getPathParam(event, 'caseId');
  const { imageType, mimeType, originalFilename } = parseBody(event, presignSchema);

  if (!BUCKET) {
    throw new ValidationError('Image bucket not configured');
  }

  const imageId = randomUUID();
  const extension = mimeType.split('/')[1] ?? 'jpg';
  const s3Key = `cases/${caseId}/${imageType}/${imageId}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: mimeType,
    Metadata: {
      'case-id': caseId,
      'user-id': auth.userId,
      'image-type': imageType,
      'original-filename': originalFilename,
    },
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });

  return ok({
    uploadUrl,
    s3Key,
    s3Bucket: BUCKET,
    imageId,
    expiresIn: PRESIGN_EXPIRY,
  });
}

export const handler = withErrorHandler(presignedUrlHandler);
