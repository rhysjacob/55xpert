import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../../lib/logger';
import { prepareImageForBedrock } from '../../lib/image';
import { CasesRepository } from '@corexpert/db';
import { quoteFromPanels, evaluateEligibility, scoreFraud, assessTotalLoss } from '@corexpert/core';
import { getSchemeForCompany } from '../../lib/warranty-company';
import type {
  TriageResult,
  DamagePanel,
  CaseStatus,
  PriceLineItem,
  CaseImage,
  FraudScoreImage,
} from '@corexpert/core';
import { extractForensics } from '../../lib/image-forensics';
import { createDamageAssessor } from '@corexpert/ai';
import type { AssessmentImage, DamageAssessmentOutput } from '@corexpert/ai';
import { resolveTriageModel } from '../../lib/model-config';
import { publishJobForCase } from '../../lib/publish-job';
import { rejectIngestedCase } from '../../lib/ingest-feedback';

const s3 = new S3Client({});
const cases = new CasesRepository();

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

    // Resolve this case's warranty ruleset from its tenant (TRX-77). Cases are
    // now tenant-stamped, so each case is priced against ITS company's scheme;
    // fall back to the deploy default only for any legacy un-stamped row.
    const scheme = await getSchemeForCompany(caseData.warrantyCompanyId ?? process.env['WARRANTY_SCHEME']);

    // Fetch each image once. Extract forensics from the ORIGINAL bytes first —
    // downscaling for Bedrock destroys EXIF and alters hashes, so order matters:
    // extract, then shrink.
    const imagesWithForensics: CaseImage[] = [...caseData.images];
    const assessmentImages: AssessmentImage[] = await Promise.all(
      caseData.images.map(async (img, i) => {
        const response = await s3.send(
          new GetObjectCommand({ Bucket: img.s3Bucket, Key: img.s3Key }),
        );
        const bytes = await response.Body!.transformToByteArray();

        // Best-effort; never let a forensic failure break triage.
        try {
          const forensics = await extractForensics(bytes);
          imagesWithForensics[i] = { ...img, forensics };
        } catch (err) {
          logger.warn('Forensic extraction failed', { caseId, imageType: img.imageType, err: String(err) });
        }

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

    // Fraud screen from the extracted per-image forensics (EXIF timing,
    // provenance, GPS). Duplicate/vision/tamper signals join in later phases.
    const fraudImages: FraudScoreImage[] = imagesWithForensics.map((img) => ({
      imageType: img.imageType,
      ...(img.forensics?.exif ? { exif: img.forensics.exif } : {}),
    }));
    const fraudAssessment = scoreFraud({
      ...(caseData.incidentDate ? { incidentDate: caseData.incidentDate } : {}),
      caseCreatedAt: caseData.createdAt,
      // postcode geocoding (for the GPS check) arrives in a later phase; until
      // then the GPS signal self-reports as notRun.
      images: fraudImages,
    });
    const fraudSuspected = fraudAssessment.band !== 'LOW';
    if (fraudSuspected) {
      logger.warn('Fraud suspected', {
        caseId,
        band: fraudAssessment.band,
        score: fraudAssessment.score,
        reasons: fraudAssessment.reasons.map((r) => r.code),
      });
    }

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

    // Total-loss guard (TRX-6): once the repair is priced, a case whose estimate
    // reaches the scheme's threshold of the vehicle's value is a potential total
    // loss — flip an otherwise-eligible case to INELIGIBLE with a TOTAL_LOSS
    // reason (auto-rejected below, not sent for review). Skipped when no value
    // is known (e.g. consumer cases carry none).
    const vehicleValuePence = caseData.vehicle?.valuePence;
    if (eligibility.verdict === 'ELIGIBLE' && vehicleValuePence != null) {
      const thresholdPct = scheme.eligibility.totalLossThresholdPct ?? 80;
      const tl = assessTotalLoss({ estimatedCostPence: totalEstimatedCost, vehicleValuePence, thresholdPct });
      if (tl.isTotalLoss) {
        eligibility.verdict = 'INELIGIBLE';
        eligibility.reasons.push({
          rule: 'TOTAL_LOSS',
          verdict: 'INELIGIBLE',
          detail: `Estimated repair £${Math.round(totalEstimatedCost / 100)} is ${tl.ratioPct}% of vehicle value £${Math.round(vehicleValuePence / 100)} (≥ ${thresholdPct}% total-loss threshold).`,
        });
        logger.info('Auto-rejected as potential total loss', { caseId, ratioPct: tl.ratioPct, thresholdPct });
      }
    }

    // Refer to an Xpert on low AI confidence OR a borderline/undeterminable
    // eligibility call. A hard INELIGIBLE verdict normally never needs review —
    // but suspected fraud ALWAYS refers, overriding that shortcut, so a
    // fraudulent-looking case gets human eyes even when we wouldn't take it.
    //
    // The model's own "needs a human" flag is the one signal a company can opt
    // out of (referOnAiUncertainty): it is the model asking for a second
    // opinion on a case its own rules accept. LOW overall confidence and the
    // fraud screen stay binding — those say the assessment cannot be trusted,
    // and no pricing decision should be made on top of one.
    const aiUncertaintyRefers = scheme.eligibility.referOnAiUncertainty !== false;
    const requiresXpertReview =
      fraudSuspected ||
      (eligibility.verdict !== 'INELIGIBLE' &&
        ((aiUncertaintyRefers && aiResult.requiresHumanReview) ||
          aiResult.overallConfidence === 'LOW' ||
          eligibility.verdict === 'REFER'));

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
      fraudAssessment,
    };

    // Outcome is fully automatic — no consumer action:
    //  - suspected fraud  → XPERT_REVIEW, always (even if otherwise INELIGIBLE).
    //  - INELIGIBLE       → we won't work on it (terminal).
    //  - needs Xpert      → XPERT_REVIEW (published on approval).
    //  - ELIGIBLE + clear → auto-publish to The Repair Xchange.
    const autoPublish = eligibility.verdict === 'ELIGIBLE' && !requiresXpertReview;
    const nextStatus: CaseStatus = requiresXpertReview
      ? 'XPERT_REVIEW'
      : eligibility.verdict === 'INELIGIBLE'
        ? 'INELIGIBLE'
        : 'TRIAGE_COMPLETE'; // transient — promoted to PUBLISHED just below
    await cases.updateTriageResult(caseId, triageResult, nextStatus, imagesWithForensics);

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
    } else if (nextStatus === 'INELIGIBLE') {
      // An ingested (warranty-company) job that triages ineligible is auto-rejected
      // back to the company with the reason (TRX-9). Total loss gets its own
      // machine code + detail (TRX-6). No-op for consumer cases.
      const totalLoss = eligibility.reasons.find((r) => r.rule === 'TOTAL_LOSS');
      const [reasonCode, detail] = totalLoss
        ? (['TOTAL_LOSS', totalLoss.detail] as const)
        : (['INELIGIBLE', triageResult.summary] as const);
      await rejectIngestedCase(caseData, reasonCode, detail).catch((err) =>
        logger.error('Ingestion rejection feedback failed', err, { caseId }),
      );
    }

    logger.info('Triage saved', {
      caseId,
      totalCost: totalEstimatedCost,
      eligibility: eligibility.verdict,
      requiresReview: requiresXpertReview,
      // Which signal sent it for review. Four separate conditions land on one
      // status, so without this "why did this case refer?" can only be answered
      // by re-deriving it from the stored result.
      reviewTriggers: requiresXpertReview
        ? [
            fraudSuspected ? 'FRAUD' : '',
            aiUncertaintyRefers && aiResult.requiresHumanReview ? 'AI_REQUESTED_REVIEW' : '',
            aiResult.overallConfidence === 'LOW' ? 'LOW_CONFIDENCE' : '',
            eligibility.verdict === 'REFER' ? 'ELIGIBILITY_REFER' : '',
          ].filter(Boolean)
        : [],
      status: published ? 'PUBLISHED' : nextStatus,
    });
  } catch (error) {
    logger.error('Triage worker failed', error, { caseId });
    // Surface the failure to the polling frontend rather than leaving the case
    // stuck in TRIAGE_PENDING. Swallow the error so async-invoke doesn't retry.
    await cases.updateStatus(caseId, 'TRIAGE_FAILED' as CaseStatus).catch(() => {});
  }
}
