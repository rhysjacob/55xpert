import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody, getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository, docClient, TABLES } from '@corexpert/db';
import { NotFoundError, ValidationError, calculateCosts } from '@corexpert/core';
import type { XpertReview, CaseStatus, DamagePanel } from '@corexpert/core';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'ADJUSTED', 'REJECTED']),
  notes: z.string().max(2000).optional(),
  adjustedPanels: z.array(z.object({
    panelName: z.string(),
    damageType: z.enum(['DENT', 'SCRATCH', 'CRACK', 'SHATTER', 'DEFORMATION', 'PAINT_DAMAGE', 'STRUCTURAL']),
    severity: z.enum(['MINOR', 'MODERATE', 'SEVERE']),
    repairMethod: z.enum(['REPAIR', 'REPLACE', 'BLEND', 'PDR', 'SMART_REPAIR']),
    confidenceScore: z.number().min(0).max(1),
    description: z.string(),
  })).optional(),
});

const cases = new CasesRepository();

async function reviewHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'XPERT');

  const caseId = getPathParam(event, 'caseId');
  const body = parseBody(event, reviewSchema);

  const caseData = await cases.getById(caseId);
  if (!caseData) {
    throw new NotFoundError('Case', caseId);
  }
  if (caseData.status !== 'XPERT_REVIEW') {
    throw new ValidationError('Case is not in XPERT_REVIEW status');
  }

  let adjustedCost: number | undefined;
  let adjustedPanels: DamagePanel[] | undefined;

  // If decision is ADJUSTED, recalculate costs with new panels
  if (body.decision === 'ADJUSTED' && body.adjustedPanels) {
    const vehicleSize = caseData.vehicle?.vehicleSize ?? 'MEDIUM';
    const costInput = body.adjustedPanels.map((p) => ({
      panelName: p.panelName,
      repairMethod: p.repairMethod,
    }));

    const costResult = calculateCosts({ panels: costInput, vehicleSize });

    adjustedPanels = body.adjustedPanels.map((panel, index) => {
      const panelCost = costResult.panelCosts[index];
      return {
        ...panel,
        labourHours: panelCost?.labourHours ?? 0,
        labourCost: panelCost?.labourCost ?? 0,
        partsCost: panelCost?.partsCost ?? 0,
        paintCost: panelCost?.paintCost ?? 0,
        subtotal: panelCost?.subtotal ?? 0,
      };
    });

    adjustedCost = costResult.grandTotal;
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

  // Update status based on decision
  const nextStatus: CaseStatus = body.decision === 'REJECTED'
    ? 'CANCELLED'
    : 'TRIAGE_COMPLETE';
  await cases.updateStatus(caseId, nextStatus);

  // If adjusted, update the triage result with new panels and cost
  if (body.decision === 'ADJUSTED' && adjustedPanels && adjustedCost !== undefined && caseData.triageResult) {
    await cases.updateTriageResult(caseId, {
      ...caseData.triageResult,
      panels: adjustedPanels,
      totalEstimatedCost: adjustedCost,
      requiresXpertReview: false,
    }, nextStatus);
  }

  logger.info('Xpert review submitted', {
    caseId,
    reviewId: review.reviewId,
    decision: body.decision,
  });

  return ok({ review });
}

export const handler = withErrorHandler(reviewHandler);
