import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { JobsRepository, CasesRepository, PaymentsRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError } from '@corexpert/core';

const jobs = new JobsRepository();
const cases = new CasesRepository();
const payments = new PaymentsRepository();

async function detailsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const jobId = getPathParam(event, 'jobId');

  const job = await jobs.getById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }

  // Only the accepting repairer can see full details
  if (!job.acceptance || job.acceptance.repairerId !== auth.userId) {
    throw new ForbiddenError('Only the accepting repairer can view full job details');
  }

  // Check payment is complete
  const payment = job.acceptance.paymentId
    ? await payments.getById(job.acceptance.paymentId)
    : null;

  if (!payment || payment.status !== 'SUCCEEDED') {
    throw new ForbiddenError('Payment must be completed before viewing full details');
  }

  // Full case details
  const caseData = await cases.getById(job.caseId);
  if (!caseData) {
    throw new NotFoundError('Case', job.caseId);
  }

  return ok({
    job,
    case: {
      caseId: caseData.caseId,
      referenceNo: caseData.referenceNo,
      postcode: caseData.postcode,
      incidentDate: caseData.incidentDate,
      incidentNotes: caseData.incidentNotes,
      vehicle: caseData.vehicle,
      triageResult: caseData.triageResult,
    },
  });
}

export const handler = withErrorHandler(detailsHandler);
