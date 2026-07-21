import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { created } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';
import { publishJobForCase } from '../../lib/publish-job';

const cases = new CasesRepository();

async function publishHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  if (caseData.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to publish this case');
  }
  if (!caseData.triageResult) {
    throw new ValidationError('Triage must be complete before publishing');
  }
  if (caseData.status !== 'TRIAGE_COMPLETE' && caseData.status !== 'XPERT_REVIEW') {
    throw new ValidationError(`Case cannot be published in ${caseData.status} status`);
  }

  const job = await publishJobForCase(caseData);

  return created(job);
}

export const handler = withErrorHandler(publishHandler);
