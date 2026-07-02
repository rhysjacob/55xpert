import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../../lib/logger';
import { prepareImageForBedrock } from '../../lib/image';
import { CasesRepository } from '@corexpert/db';
import { quoteFromPanels, evaluateEligibility, getActiveScheme } from '@corexpert/core';
import type { TriageResult, DamagePanel, CaseStatus, PriceLineItem } from '@corexpert/core';
import { createDamageAssessor } from '@corexpert/ai';
import type { AssessmentImage, DamageAssessmentOutput } from '@corexpert/ai';
import { resolveTriageModel } from '../../lib/model-config';
import { publishJobForCase } from '../../lib/publish-job';

const s3 = new S3Client({});
const cases = new CasesRepository();
// Active warranty ruleset, selected at deploy time via WARRANTY_SCHEME.
const scheme = getActiveScheme(process.env['WARRANTY_SCHEME']);

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

    // Resolve the model per-invocation: honour the SSM debug override if the
    // feature toggle is on, else the deploy-time default. Fails safe to default.
    const modelId = await resolveTriageModel(process.env['AI_MODEL_ID'] ?? '');
    const assessor = createDamageAssessor(modelId ? { modelId } : undefined);
    logger.info('Triage model resolved', { caseId, modelId: assessor.modelId });

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
      model: assessor.modelId,
      panelCount: aiResult.panels.length,
      confidence: aiResult.overallConfidence,
      inputTokens: aiResult.usage?.inputTokens,
      outputTokens: aiResult.usage?.outputTokens,
    });

    // Work-acceptance gate: decide whether we take the job before pricing it.
    // Method/severity feed the "REPLACE or SEVERE → refer to Xpert" rule.
    const eligibility = evaluateEligibility(
      {
        panels: aiResult.panels.map((p) => ({
          panelName: p.panelName,
          sizeEstimateCm: p.sizeEstimateCm,
          sizeConfidence: p.sizeConfidence,
          severity: p.severity,
          repairMethod: p.repairMethod,
        })),
      },
      scheme.eligibility,
    );

    const panels: DamagePanel[] = aiResult.panels.map((panel) => ({
      panelName: panel.panelName,
      damageType: panel.damageType,
      severity: panel.severity,
      repairMethod: panel.repairMethod,
      confidenceScore: panel.confidenceScore,
      description: panel.description,
      ...(panel.sizeEstimateCm !== undefined ? { sizeEstimateCm: panel.sizeEstimateCm } : {}),
      ...(panel.sizeConfidence !== undefined ? { sizeConfidence: panel.sizeConfidence } : {}),
    }));

    // Refer to an Xpert on low AI confidence OR a borderline/undeterminable
    // eligibility call. A hard INELIGIBLE verdict never needs review.
    const requiresXpertReview =
      eligibility.verdict !== 'INELIGIBLE' &&
      (aiResult.requiresHumanReview ||
        aiResult.overallConfidence === 'LOW' ||
        eligibility.verdict === 'REFER');

    // The matrix is the SOLE source of price. Only price a fully-eligible job;
    // INELIGIBLE cases and cases awaiting an Xpert carry no auto-generated price.
    let totalEstimatedCost = 0;
    let matrixVersion: string | undefined;
    let priceLineItems: PriceLineItem[] | undefined;
    if (eligibility.verdict === 'ELIGIBLE') {
      const quote = quoteFromPanels(aiResult.panels.map((p) => ({ panelName: p.panelName })), scheme.matrix);
      totalEstimatedCost = quote.total;
      matrixVersion = quote.matrixVersion;
      priceLineItems = quote.lineItems;
    }

    const triageResult: TriageResult = {
      overallConfidence: aiResult.overallConfidence,
      requiresXpertReview,
      eligibility,
      aiModelId: aiResult.modelId,
      aiRawResponse: aiResult.rawResponse,
      summary: aiResult.summary,
      totalEstimatedCost,
      ...(matrixVersion ? { matrixVersion } : {}),
      ...(priceLineItems ? { priceLineItems } : {}),
      panels,
    };

    // Outcome is fully automatic — no consumer action:
    //  - INELIGIBLE       → we won't work on it (terminal).
    //  - needs Xpert      → XPERT_REVIEW (published on approval).
    //  - ELIGIBLE + clear → auto-publish to The Repair Xchange.
    const autoPublish = eligibility.verdict === 'ELIGIBLE' && !requiresXpertReview;
    const nextStatus: CaseStatus =
      eligibility.verdict === 'INELIGIBLE'
        ? 'INELIGIBLE'
        : requiresXpertReview
          ? 'XPERT_REVIEW'
          : 'TRIAGE_COMPLETE'; // transient — promoted to PUBLISHED just below
    await cases.updateTriageResult(caseId, triageResult, nextStatus);

    let published = false;
    if (autoPublish) {
      try {
        const job = await publishJobForCase({ ...caseData, triageResult, status: nextStatus });
        published = true;
        logger.info('Case auto-published to network', { caseId, jobId: job.jobId });
      } catch (error) {
        // Leave the case at TRIAGE_COMPLETE so it can be retried; don't fail triage.
        logger.error('Auto-publish failed', error, { caseId });
      }
    }

    logger.info('Triage saved', {
      caseId,
      totalCost: totalEstimatedCost,
      eligibility: eligibility.verdict,
      requiresReview: requiresXpertReview,
      status: published ? 'PUBLISHED' : nextStatus,
    });
  } catch (error) {
    logger.error('Triage worker failed', error, { caseId });
    // Surface the failure to the polling frontend rather than leaving the case
    // stuck in TRIAGE_PENDING. Swallow the error so async-invoke doesn't retry.
    await cases.updateStatus(caseId, 'TRIAGE_FAILED' as CaseStatus).catch(() => {});
  }
}
