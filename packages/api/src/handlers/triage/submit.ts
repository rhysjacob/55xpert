import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { CasesRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError, calculateCosts } from '@corexpert/core';
import type { TriageResult, DamagePanel, CaseStatus } from '@corexpert/core';
import { createDamageAssessor } from '@corexpert/ai';
import type { AssessmentImage, DamageAssessmentOutput } from '@corexpert/ai';

const s3 = new S3Client({});
const cases = new CasesRepository();
const assessor = createDamageAssessor();

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

  // Mark as pending
  await cases.updateStatus(caseId, 'TRIAGE_PENDING' as CaseStatus);

  logger.info('Starting triage', { caseId, imageCount: caseData.images.length });

  // Fetch images from S3 and convert to base64
  const assessmentImages: AssessmentImage[] = await Promise.all(
    caseData.images.map(async (img) => {
      const response = await s3.send(new GetObjectCommand({
        Bucket: img.s3Bucket,
        Key: img.s3Key,
      }));

      const bytes = await response.Body!.transformToByteArray();
      const base64 = Buffer.from(bytes).toString('base64');

      return {
        base64,
        mimeType: img.mimeType ?? 'image/jpeg',
        imageType: img.imageType,
      };
    }),
  );

  // Run AI assessment
  let aiResult: DamageAssessmentOutput;
  try {
    aiResult = await assessor.assessDamage({
      images: assessmentImages,
      vehicle: {
        make: caseData.vehicle?.make,
        model: caseData.vehicle?.model,
        year: caseData.vehicle?.year,
        colour: caseData.vehicle?.colour,
        vehicleSize: caseData.vehicle?.vehicleSize,
      },
    });
  } catch (error) {
    logger.error('AI assessment failed', error, { caseId });
    await cases.updateStatus(caseId, 'DRAFT' as CaseStatus);
    throw error;
  }

  logger.info('AI assessment complete', {
    caseId,
    panelCount: aiResult.panels.length,
    confidence: aiResult.overallConfidence,
  });

  // Run cost calculator
  const vehicleSize = caseData.vehicle?.vehicleSize ?? 'MEDIUM';
  const costInput = aiResult.panels.map((panel) => ({
    panelName: panel.panelName,
    repairMethod: panel.repairMethod,
  }));

  const costResult = calculateCosts({
    panels: costInput,
    vehicleSize,
  });

  // Build enriched panels with cost data
  const enrichedPanels: DamagePanel[] = aiResult.panels.map((panel, index) => {
    const panelCost = costResult.panelCosts[index];
    return {
      panelName: panel.panelName,
      damageType: panel.damageType,
      severity: panel.severity,
      repairMethod: panel.repairMethod,
      confidenceScore: panel.confidenceScore,
      description: panel.description,
      labourHours: panelCost?.labourHours ?? 0,
      labourCost: panelCost?.labourCost ?? 0,
      partsCost: panelCost?.partsCost ?? 0,
      paintCost: panelCost?.paintCost ?? 0,
      subtotal: panelCost?.subtotal ?? 0,
    };
  });

  // Build triage result
  const triageResult: TriageResult = {
    overallConfidence: aiResult.overallConfidence,
    requiresXpertReview: aiResult.requiresHumanReview || aiResult.overallConfidence === 'LOW',
    aiModelId: aiResult.modelId,
    aiRawResponse: aiResult.rawResponse,
    summary: aiResult.summary,
    totalEstimatedCost: costResult.grandTotal,
    totalLabourHours: costResult.totalLabourHours,
    totalPartsCost: costResult.totalPartsCost,
    totalPaintCost: costResult.totalPaintCost,
    panels: enrichedPanels,
  };

  // Save and update status
  const nextStatus: CaseStatus = triageResult.requiresXpertReview
    ? 'XPERT_REVIEW'
    : 'TRIAGE_COMPLETE';
  await cases.updateTriageResult(caseId, triageResult, nextStatus);

  logger.info('Triage saved', {
    caseId,
    totalCost: costResult.grandTotal,
    requiresReview: triageResult.requiresXpertReview,
  });

  return ok({ triageResult });
}

export const handler = withErrorHandler(submitHandler);
