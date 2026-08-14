import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError } from '@corexpert/core';
import { presignImages } from '../../lib/image-urls';

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

  const images = (await presignImages(caseData.images)).map((img) => ({
    imageType: img.imageType,
    url: img.url,
  }));

  // triageResult may be absent while the async worker is still running
  // (status TRIAGE_PENDING) — return it as null so the frontend can poll on
  // status rather than treating a pending case as an error.
  return ok({
    caseId: caseData.caseId,
    referenceNo: caseData.referenceNo,
    status: caseData.status,
    // The tenant is returned so the portal can show a warranty company's own
    // wording for a referral. It has to come from the case rather than the
    // hostname: a user can reach any portal, but the case belongs to one tenant.
    warrantyCompanyId: caseData.warrantyCompanyId,
    vehicle: caseData.vehicle,
    triageResult: caseData.triageResult ?? null,
    siteAllocationRequestedAt: caseData.siteAllocationRequestedAt,
    xpertReviews: caseData.xpertReviews,
    images,
  });
}

export const handler = withErrorHandler(resultHandler);
