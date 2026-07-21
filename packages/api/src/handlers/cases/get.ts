import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError } from '@corexpert/core';
import { withViewableImages } from '../../lib/image-urls';

const cases = new CasesRepository();

async function getHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }

  // Consumers can only see their own cases. Xperts and admins can see all.
  const isOwner = caseData.userId === auth.userId;
  const isPrivileged = auth.roles.some((r) => r === 'XPERT' || r === 'ADMIN');
  if (!isOwner && !isPrivileged) {
    throw new ForbiddenError('Not authorized to view this case');
  }

  // Attach short-lived presigned GET URLs so the case detail view can render
  // the damage photos (the bucket is private).
  return ok(await withViewableImages(caseData));
}

export const handler = withErrorHandler(getHandler);
