import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository, CorrectionsRepository, docClient, TABLES } from '@corexpert/db';
import { publishJobForCase } from '../../lib/publish-job';
import { buildCorrectionRecord } from '../../lib/corrections';
import { NotFoundError, ValidationError, quoteFromPanels } from '@corexpert/core';
import { getSchemeForCompany } from '../../lib/warranty-company';
import type { XpertReview, CaseStatus, DamagePanel } from '@corexpert/core';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'ADJUSTED', 'REJECTED']),
  notes: z.string().max(2000).optional(),
  /** Xpert-set price in pence. Overrides the matrix suggestion when provided. */
  overrideCost: z.number().int().nonnegative().optional(),
  adjustedPanels: z.array(z.object({
    panelName: z.string(),
    damageType: z.enum(['DENT', 'SCRATCH', 'CRACK', 'SHATTER', 'DEFORMATION', 'PAINT_DAMAGE', 'STRUCTURAL']),
    severity: z.enum(['MINOR', 'MODERATE', 'SEVERE']),
    repairMethod: z.enum(['REPAIR', 'REPLACE', 'BLEND', 'PDR']),
    confidenceScore: z.number().min(0).max(1),
    description: z.string(),
  })).optional(),
});

const cases = new CasesRepository();
const corrections = new CorrectionsRepository();
async function reviewHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'XPERT');

  const caseId = getPathParam(event, 'caseId');
  const body = parseBody(event, reviewSchema);

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  // Resolve the case's warranty ruleset from its tenant (TRX-77); fall back to
  // the deploy default only for a legacy un-stamped case.
  const scheme = await getSchemeForCompany(caseData.warrantyCompanyId ?? process.env['WARRANTY_SCHEME']);
  // An Xpert can review cases awaiting review, or override an auto-declined
  // (INELIGIBLE) case.
  if (caseData.status !== 'XPERT_REVIEW' && caseData.status !== 'INELIGIBLE') {
    throw new ValidationError('Case is not awaiting Xpert review');
  }

  let adjustedCost: number | undefined;
  let adjustedPanels: DamagePanel[] | undefined;

  // Pricing (any non-rejected decision): the matrix is the suggestion; an Xpert
  // `overrideCost` (pence) wins. This lets an Xpert price a case the matrix
  // couldn't (e.g. an overridden ineligible case) or correct the suggestion.
  if (body.decision !== 'REJECTED') {
    if (body.adjustedPanels) {
      adjustedPanels = body.adjustedPanels.map((panel) => ({ ...panel }));
    }
    const matrixSuggestion = body.adjustedPanels
      ? quoteFromPanels(body.adjustedPanels.map((p) => ({ panelName: p.panelName })), scheme.matrix).total
      : undefined;
    if (body.overrideCost !== undefined) {
      adjustedCost = body.overrideCost;
    } else if (matrixSuggestion !== undefined) {
      adjustedCost = matrixSuggestion;
    }
  }

  const review: XpertReview = {
    reviewId: randomUUID(),
    xpertUserId: auth.userId,
    decision: body.decision,
    notes: body.notes,
    adjustedPanels,
    adjustedCost,
    reviewedAt: new Date().toISOString(),
  };

  // Append review to xpertReviews array
  await docClient.send(new UpdateCommand({
    TableName: TABLES.CASES,
    Key: { caseId },
    UpdateExpression: 'SET xpertReviews = list_append(if_not_exists(xpertReviews, :emptyList), :review), updatedAt = :now',
    ExpressionAttributeValues: {
      ':review': [review],
      ':emptyList': [],
      ':now': new Date().toISOString(),
    },
  }));

  // Capture the labelled AI-vs-human record whenever the Xpert changed or
  // overrode the AI (ADJUSTED/REJECTED). Best-effort: never fail the review if
  // the corrections write fails. caseData still holds the original AI triage.
  if (body.decision !== 'APPROVED') {
    try {
      await corrections.create(buildCorrectionRecord(caseData, review));
    } catch (error) {
      logger.error('Failed to persist correction record', error, { caseId, reviewId: review.reviewId });
    }
  }

  if (body.decision === 'REJECTED') {
    await cases.updateStatus(caseId, 'CANCELLED' as CaseStatus);

    logger.info('Xpert review submitted', { caseId, reviewId: review.reviewId, decision: body.decision });
    return ok({ review });
  }

  // Approved (or approved-with-adjustments): finalise the triage result and
  // publish the case to The Repair Xchange so repairers can see/accept it.
  let finalCase = { ...caseData };

  // Persist adjusted panels and/or the final price before publishing so the job
  // carries the Xpert-approved cost.
  if ((adjustedPanels || adjustedCost !== undefined) && caseData.triageResult) {
    const updatedTriage = {
      ...caseData.triageResult,
      ...(adjustedPanels ? { panels: adjustedPanels } : {}),
      ...(adjustedCost !== undefined ? { totalEstimatedCost: adjustedCost } : {}),
      requiresXpertReview: false,
    };
    // Persist as TRIAGE_COMPLETE first; publishJobForCase moves it to PUBLISHED.
    await cases.updateTriageResult(caseId, updatedTriage, 'TRIAGE_COMPLETE' as CaseStatus);
    finalCase = { ...finalCase, triageResult: updatedTriage };
  }

  const job = await publishJobForCase(finalCase);

  logger.info('Xpert review submitted, job published', {
    caseId,
    reviewId: review.reviewId,
    decision: body.decision,
    jobId: job.jobId,
  });

  return ok({ review, job });
}

export const handler = withErrorHandler(reviewHandler);
