import type { DamagePanel, XpertDecision, EligibilityResult } from './triage';
import type { Vehicle } from './vehicle';

/**
 * A structured, labelled record of one Xpert decision: what the AI produced vs.
 * what the human ruled. This is the training/eval asset — the raw material for
 * measuring where the AI disagrees with experts and (later) for retrieval-based
 * few-shot prompting so similar future cases lean the right way.
 *
 * One record is written per non-APPROVED review (ADJUSTED or REJECTED), i.e.
 * every time the human changed or overrode the AI.
 */
export interface Correction {
  correctionId: string;
  caseId: string;
  reviewId: string;
  xpertUserId: string;
  decision: XpertDecision;

  /** Vehicle context, snapshotted for later analysis / retrieval. */
  vehicle?: Vehicle;
  /** S3 keys of the images the AI assessed — the perceptual input. */
  imageKeys: string[];

  // ---- What the AI produced ----
  aiModelId: string;
  aiPanels: DamagePanel[];
  aiTotalCost: number;
  aiEligibility?: EligibilityResult;

  // ---- What the Xpert decided ----
  /** Present when the decision was ADJUSTED. Absent for a plain REJECTED. */
  expertPanels?: DamagePanel[];
  expertTotalCost?: number;
  notes?: string;

  // ---- Pre-computed deltas for quick evals ----
  /** expertPanels.length − aiPanels.length (0 when not adjusted). */
  panelCountDelta: number;
  /** expertTotalCost − aiTotalCost (undefined when not adjusted). */
  costDelta?: number;
  /** Panel names where the Xpert changed damage type, severity or repair method. */
  changedPanels: string[];

  createdAt: string;
}
