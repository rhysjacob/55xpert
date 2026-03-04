import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError } from '@corexpert/core';
import type { CaseImage } from '@corexpert/core';

const confirmSchema = z.object({
  imageType: z.enum([
    'REGISTRATION_PLATE',
    'DAMAGE_ANGLE_1',
    'DAMAGE_ANGLE_2',
    'DAMAGE_ANGLE_3',
  ]),
  s3Key: z.string().min(1),
  s3Bucket: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
});

const cases = new CasesRepository();

async function confirmHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  const caseId = getPathParam(event, 'caseId');
  const body = parseBody(event, confirmSchema);

  const existing = await cases.getById(caseId);
  if (!existing) {
    throw new NotFoundError('Case', caseId);
  }
  if (existing.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to modify this case');
  }

  const image: CaseImage = {
    imageType: body.imageType,
    s3Key: body.s3Key,
    s3Bucket: body.s3Bucket,
    originalFilename: body.originalFilename,
    mimeType: body.mimeType,
    uploadedAt: new Date().toISOString(),
  };

  await cases.addImage(caseId, image);

  // If all 4 images uploaded, update status
  const updated = await cases.getById(caseId);
  if (updated && updated.images.length >= 4) {
    await cases.updateStatus(caseId, 'IMAGES_UPLOADED');
  }

  return ok({ image });
}

export const handler = withErrorHandler(confirmHandler);
