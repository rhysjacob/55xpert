import { randomUUID } from 'node:crypto';
import type { Case, Correction, DamagePanel, XpertReview } from '@corexpert/core';

/**
 * Build a labelled Correction record from a case and the Xpert's review.
 *
 * Called for non-APPROVED reviews (ADJUSTED / REJECTED) — the cases where the
 * human changed or overrode the AI, which is exactly the signal worth keeping.
 * Deltas are pre-computed so evals/dashboards don't have to recompute them.
 */
export function buildCorrectionRecord(caseData: Case, review: XpertReview): Correction {
  const triage = caseData.triageResult;
  const aiPanels: DamagePanel[] = triage?.panels ?? [];
  const expertPanels = review.adjustedPanels;

  const aiTotalCost = triage?.totalEstimatedCost ?? 0;
  const panelCountDelta = expertPanels ? expertPanels.length - aiPanels.length : 0;
  const costDelta =
    review.adjustedCost !== undefined ? review.adjustedCost - aiTotalCost : undefined;

  const changedPanels = expertPanels ? diffPanels(aiPanels, expertPanels) : [];

  const correction: Correction = {
    correctionId: randomUUID(),
    caseId: caseData.caseId,
    reviewId: review.reviewId,
    xpertUserId: review.xpertUserId,
    decision: review.decision,
    imageKeys: caseData.images.map((img) => img.s3Key),
    aiModelId: triage?.aiModelId ?? 'unknown',
    aiPanels,
    aiTotalCost,
    panelCountDelta,
    changedPanels,
    createdAt: new Date().toISOString(),
  };

  // exactOptionalPropertyTypes: only attach optional fields when defined.
  if (caseData.vehicle) correction.vehicle = caseData.vehicle;
  if (triage?.eligibility) correction.aiEligibility = triage.eligibility;
  if (expertPanels) correction.expertPanels = expertPanels;
  if (review.adjustedCost !== undefined) correction.expertTotalCost = review.adjustedCost;
  if (review.notes) correction.notes = review.notes;
  if (costDelta !== undefined) correction.costDelta = costDelta;

  return correction;
}

/** Panel names where the Xpert changed damage type, severity or repair method. */
function diffPanels(aiPanels: DamagePanel[], expertPanels: DamagePanel[]): string[] {
  const aiByName = new Map(aiPanels.map((p) => [p.panelName, p]));
  const changed = new Set<string>();

  for (const ep of expertPanels) {
    const ai = aiByName.get(ep.panelName);
    if (
      !ai ||
      ai.damageType !== ep.damageType ||
      ai.severity !== ep.severity ||
      ai.repairMethod !== ep.repairMethod
    ) {
      changed.add(ep.panelName);
    }
  }
  // Panels the AI saw but the Xpert removed also count as changes.
  for (const ai of aiPanels) {
    if (!expertPanels.some((ep) => ep.panelName === ai.panelName)) {
      changed.add(ai.panelName);
    }
  }

  return [...changed];
}
