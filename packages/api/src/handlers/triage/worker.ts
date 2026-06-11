import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../../lib/logger';
import { prepareImageForBedrock } from '../../lib/image';
import { CasesRepository } from '@corexpert/db';
import { calculateCosts } from '@corexpert/core';
import type { TriageResult, DamagePanel, CaseStatus } from '@corexpert/core';
import { createDamageAssessor } from '@corexpert/ai';
import type { AssessmentImage, DamageAssessmentOutput } from '@corexpert/ai';

const s3 = new S3Client({});
const cases = new CasesRepository();
const assessor = createDamageAssessor();

export interface TriageWorkerEvent {
  caseId: string;
}

/**
 * Asynchronous triage worker. Invoked (InvocationType: 'Event') by the triage
 * submit handler so the long-running Bedrock vision call isn't bound by the
 * API Gateway ~30s integration timeout. Writes the result/status back to the
 * case; the frontend polls GET /triage for completion.
 */
export async function handler(event: TriageWorkerEvent): Promise<void> {
  const { caseId } = event;
  logger.info('Starting triage', { caseId });

  try {
    const caseData = await cases.getById(caseId);
    if (!caseData) {
      logger.error('Triage worker: case not found', undefined, { caseId });
      return;
    }

    // Fetch images from S3, downscaling any that exceed Bedrock's per-image limit.
    const assessmentImages: AssessmentImage[] = await Promise.all(
      caseData.images.map(async (img) => {
        const response = await s3.send(
          new GetObjectCommand({ Bucket: img.s3Bucket, Key: img.s3Key }),
        );
        const bytes = await response.Body!.transformToByteArray();
        const prepared = await prepareImageForBedrock(bytes, img.mimeType ?? 'image/jpeg');
        return {
          base64: prepared.base64,
          mimeType: prepared.mimeType,
          imageType: img.imageType,
        };
      }),
    );

    const aiResult: DamageAssessmentOutput = await assessor.assessDamage({
      images: assessmentImages,
      vehicle: {
        make: caseData.vehicle?.make,
        model: caseData.vehicle?.model,
        year: caseData.vehicle?.year,
        colour: caseData.vehicle?.colour,
        vehicleSize: caseData.vehicle?.vehicleSize,
      },
    });

    logger.info('AI assessment complete', {
      caseId,
      panelCount: aiResult.panels.length,
      confidence: aiResult.overallConfidence,
    });

    const vehicleSize = caseData.vehicle?.vehicleSize ?? 'MEDIUM';
    const costResult = calculateCosts({
      panels: aiResult.panels.map((panel) => ({
        panelName: panel.panelName,
        repairMethod: panel.repairMethod,
      })),
      vehicleSize,
    });

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

    const nextStatus: CaseStatus = triageResult.requiresXpertReview
      ? 'XPERT_REVIEW'
      : 'TRIAGE_COMPLETE';
    await cases.updateTriageResult(caseId, triageResult, nextStatus);

    logger.info('Triage saved', {
      caseId,
      totalCost: costResult.grandTotal,
      requiresReview: triageResult.requiresXpertReview,
    });
  } catch (error) {
    logger.error('Triage worker failed', error, { caseId });
    // Surface the failure to the polling frontend rather than leaving the case
    // stuck in TRIAGE_PENDING. Swallow the error so async-invoke doesn't retry.
    await cases.updateStatus(caseId, 'TRIAGE_FAILED' as CaseStatus).catch(() => {});
  }
}
