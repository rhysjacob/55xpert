import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';
import type { CaseStatus } from '@corexpert/core';
import type { TriageWorkerEvent } from './worker';

const cases = new CasesRepository();
const lambda = new LambdaClient({});

/**
 * Triage trigger. Validates the request, marks the case TRIAGE_PENDING, then
 * asynchronously invokes the triage worker and returns immediately. The actual
 * Bedrock vision call runs in the worker (well beyond the API Gateway ~30s
 * limit); the frontend polls GET /triage until the status changes.
 */
async function submitHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');

  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  if (caseData.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to triage this case');
  }
  if (caseData.images.length < 4) {
    throw new ValidationError('All 4 images must be uploaded before submitting for triage');
  }

  await cases.updateStatus(caseId, 'TRIAGE_PENDING' as CaseStatus);

  const workerFunction = process.env['TRIAGE_WORKER_FUNCTION'];
  if (!workerFunction) {
    throw new Error('TRIAGE_WORKER_FUNCTION env var is not configured');
  }

  const payload: TriageWorkerEvent = { caseId };
  await lambda.send(
    new InvokeCommand({
      FunctionName: workerFunction,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  logger.info('Triage queued', { caseId, imageCount: caseData.images.length });

  return ok({ caseId, status: 'TRIAGE_PENDING' });
}

export const handler = withErrorHandler(submitHandler);
