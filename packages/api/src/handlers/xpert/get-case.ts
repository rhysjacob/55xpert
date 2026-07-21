import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError } from '@corexpert/core';

const cases = new CasesRepository();

async function getCaseHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'XPERT', 'ADMIN');

  const caseId = getPathParam(event, 'caseId');
  const caseData = await cases.getById(caseId);

  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }

  return ok(caseData);
}

export const handler = withErrorHandler(getCaseHandler);
