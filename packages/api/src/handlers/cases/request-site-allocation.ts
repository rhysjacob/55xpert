import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';
import { emitDomainEvent, DomainEvent } from '../../lib/events';

const cases = new CasesRepository();

/**
 * The consumer asks their warranty company to allocate a referred case to one
 * of its own sites — the "this can't be done as a mobile repair" hand-off.
 *
 * The case is already with an Xpert when this is offered; this records the
 * consumer's request and emits the event that alerts the company. It does NOT
 * choose a site: which site takes the work is the company's call, made off the
 * back of the alert.
 */
async function requestSiteAllocationHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'CONSUMER');
  const caseId = getPathParam(event, 'caseId');

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  if (caseData.userId !== auth.userId) {
    throw new ForbiddenError('Not authorized to act on this case');
  }

  // Only a referred case can be handed to a site. An eligible case has a price
  // and a route to a repairer; an ineligible one is turned down outright. Both
  // would be a promise we cannot keep.
  if (caseData.triageResult?.eligibility?.verdict !== 'REFER') {
    throw new ValidationError('This case has not been referred for review');
  }

  // Idempotent: a second request returns the first one's timestamp rather than
  // alerting the company again.
  const alreadyRequested = caseData.siteAllocationRequestedAt !== undefined;
  const requestedAt = await cases.markSiteAllocationRequested(caseId);

  if (!alreadyRequested) {
    await emitDomainEvent(DomainEvent.CASE_SITE_ALLOCATION_REQUESTED, { caseId });
  }

  return ok({ caseId, siteAllocationRequestedAt: requestedAt });
}

export const handler = withErrorHandler(requestSiteAllocationHandler);
