import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';

const cases = new CasesRepository();

async function resultHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }

  // Consumers can only see their own. Xperts/admins can see all.
  const isOwner = caseData.userId === auth.userId;
  const isPrivileged = auth.roles.some((r) => r === 'XPERT' || r === 'ADMIN');
  if (!isOwner && !isPrivileged) {
    throw new ForbiddenError('Not authorized to view this triage result');
  }

  if (!caseData.triageResult) {
    throw new ValidationError('Triage has not been completed for this case');
  }

  return ok({
    caseId: caseData.caseId,
    referenceNo: caseData.referenceNo,
    status: caseData.status,
    vehicle: caseData.vehicle,
    triageResult: caseData.triageResult,
    xpertReviews: caseData.xpertReviews,
  });
}

export const handler = withErrorHandler(resultHandler);
