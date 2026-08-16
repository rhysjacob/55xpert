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

/**
 * One size reading per distinct panel, for the limit checks below.
 *
 * Several entries for one panel are several readings of one piece of damage.
 * The question the limit asks is "is this damage inside what we take on", so
 * among the readings we TRUST — those at or above minSizeConfidence — the
 * answer has to come from the LARGEST, the worst case. A reading is either
 * credible enough to act on or it is not; once it is credible, the fact that
 * another reading happened to be a shade more confident does not make the
 * bigger measurement go away.
 *
 * Picking the single most confident reading instead let a rounding-level
 * difference in confidence decide the verdict. CX-20260816-IYSR came back with
 * a rear quarter at 40cm/0.70 and the same quarter at 35cm/0.72; the 0.02
 * carried it, 35cm fell below the 36cm borderline, and a caved-in quarter
 * panel published instead of going to an Xpert.
 *
 * When nothing about a panel is trusted, its most confident reading is returned
 * so SIZE_UNKNOWN still fires and still has sensible numbers to quote.
 */
function sizeReadingPerPanel(
  panels: EligibilityPanelInput[],
  minSizeConfidence: number,
): EligibilityPanelInput[] {
  const byPanel = new Map<string, EligibilityPanelInput[]>();
  for (const panel of panels) {
    const group = byPanel.get(panel.panelName);
    if (group) group.push(panel);
    else byPanel.set(panel.panelName, [panel]);
  }

  const size = (p: EligibilityPanelInput) => p.sizeEstimateCm ?? -1;
  const conf = (p: EligibilityPanelInput) => p.sizeConfidence ?? -1;
  const pick = (group: EligibilityPanelInput[], by: (p: EligibilityPanelInput) => number) =>
    group.reduce((best, p) => (by(p) > by(best) ? p : best));

  return [...byPanel.values()].map((group) => {
    const trusted = group.filter(
      (p) => p.sizeEstimateCm !== undefined && conf(p) >= minSizeConfidence,
    );
    return trusted.length > 0 ? pick(trusted, size) : pick(group, conf);
  });
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
  //
  // Sized per DISTINCT panel, like the count above and the matrix price. Two
  // entries for one bumper are two views of one piece of damage, and the panel
  // is judged on the view the assessor could actually read: the entry it gave
  // the highest sizeConfidence, ties going to the larger estimate.
  //
  // Iterating raw entries meant any single hazy observation referred the whole
  // case, even when the same panel had also been read confidently. That turned
  // live when panels began citing the image they were seen in and the assessor
  // started returning one entry per photo: CX-20260816-MJ55 came back as a rear
  // bumper at 0.45 AND the same bumper at 0.5, and referred on the 0.45 — where
  // the day before, one entry at 0.6 published.
  for (const panel of sizeReadingPerPanel(input.panels, rules.minSizeConfidence)) {
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
