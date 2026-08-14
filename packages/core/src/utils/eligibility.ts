import type { EligibilityResult, EligibilityReason, EligibilityVerdict } from '../types/triage';
import type { EligibilityRules } from '../schemes/types';
import { humanize } from './humanize';

/** The subset of a detected/damage panel the eligibility engine needs. */
export interface EligibilityPanelInput {
  panelName: string;
  sizeEstimateCm?: number;
  sizeConfidence?: number;
  /** MINOR | MODERATE | SEVERE — SEVERE is non-standard and refers to an Xpert. */
  severity?: string;
  /** REPAIR | REPLACE | BLEND | PDR — REPLACE refers to an Xpert. */
  repairMethod?: string;
}

export interface EligibilityInput {
  panels: EligibilityPanelInput[];
}

/** Verdict precedence: INELIGIBLE beats REFER beats ELIGIBLE. */
const VERDICT_RANK: Record<EligibilityVerdict, number> = {
  ELIGIBLE: 0,
  REFER: 1,
  INELIGIBLE: 2,
};

function worst(a: EligibilityVerdict, b: EligibilityVerdict): EligibilityVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

/**
 * Evaluate a case against a scheme's work-acceptance rules.
 *
 * Hard rules (→ INELIGIBLE): more than `rules.maxDamagedPanels` panels, any
 * `rules.excludedPanels` damaged, or damage clearly larger than
 * `rules.maxDamageCm`. Borderline/undeterminable sizes and non-standard repairs
 * (REPLACE/SEVERE, when the scheme refers them) → REFER. Otherwise ELIGIBLE.
 *
 * Money/pricing is intentionally out of scope — this only decides whether we
 * take the job. The `rules` come from the active {@link WarrantyScheme}.
 */
export function evaluateEligibility(input: EligibilityInput, rules: EligibilityRules): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  let verdict: EligibilityVerdict = 'ELIGIBLE';

  // Rule 1 — panel count (deterministic, no borderline). Counts DISTINCT
  // panels: the assessment may list one panel twice (a scuff and a crack on the
  // same bumper), and two damage areas on one panel is still one damaged panel.
  const damagedPanelCount = new Set(input.panels.map((p) => p.panelName)).size;
  if (damagedPanelCount > rules.maxDamagedPanels) {
    verdict = worst(verdict, 'INELIGIBLE');
    reasons.push({
      rule: 'PANEL_COUNT',
      verdict: 'INELIGIBLE',
      detail: `${damagedPanelCount} damaged panels exceeds the maximum of ${rules.maxDamagedPanels}.`,
    });
  }

  // Rule 2 — excluded panels (e.g. bonnet, roof).
  const excludedHit = input.panels
    .map((p) => p.panelName)
    .filter((name) => (rules.excludedPanels as readonly string[]).includes(name));
  for (const name of excludedHit) {
    verdict = worst(verdict, 'INELIGIBLE');
    reasons.push({
      rule: 'EXCLUDED_PANEL',
      verdict: 'INELIGIBLE',
      detail: `${humanize(name)} is an excluded panel we do not work on.`,
    });
  }

  // Rule 3 — non-standard repair (REPLACE / SEVERE) → refer to an Xpert rather
  // than auto-price, when the scheme opts to.
  for (const panel of input.panels) {
    const isReplace = rules.referOnReplace && panel.repairMethod === 'REPLACE';
    const isSevere = rules.referOnSevere && panel.severity === 'SEVERE';
    if (isReplace || isSevere) {
      verdict = worst(verdict, 'REFER');
      reasons.push({
        rule: 'NON_STANDARD_REPAIR',
        verdict: 'REFER',
        detail: `${humanize(panel.panelName)} needs non-standard work (${isSevere ? 'severe damage' : 'full replacement'}); refer to Xpert.`,
      });
    }
  }

  // Rule 4 — damage size (per panel), with a borderline band and unknown handling.
  for (const panel of input.panels) {
    const { sizeEstimateCm, sizeConfidence } = panel;

    const sizeUnknown =
      sizeEstimateCm === undefined ||
      sizeConfidence === undefined ||
      sizeConfidence < rules.minSizeConfidence;

    if (sizeUnknown) {
      verdict = worst(verdict, 'REFER');
      reasons.push({
        rule: 'SIZE_UNKNOWN',
        verdict: 'REFER',
        detail: `Cannot reliably size damage on ${humanize(panel.panelName)} (estimate ${sizeEstimateCm ?? 'n/a'}cm, confidence ${sizeConfidence ?? 'n/a'}); refer to Xpert.`,
      });
      continue;
    }

    if (sizeEstimateCm > rules.maxDamageCm + rules.damageSizeBorderlineCm) {
      verdict = worst(verdict, 'INELIGIBLE');
      reasons.push({
        rule: 'DAMAGE_SIZE',
        verdict: 'INELIGIBLE',
        detail: `Damage on ${humanize(panel.panelName)} (~${sizeEstimateCm}cm) exceeds the ${rules.maxDamageCm}cm limit.`,
      });
    } else if (sizeEstimateCm > rules.maxDamageCm - rules.damageSizeBorderlineCm) {
      verdict = worst(verdict, 'REFER');
      reasons.push({
        rule: 'DAMAGE_SIZE',
        verdict: 'REFER',
        detail: `Damage on ${humanize(panel.panelName)} (~${sizeEstimateCm}cm) is near the ${rules.maxDamageCm}cm limit; refer to Xpert.`,
      });
    }
  }

  return { verdict, reasons };
}
