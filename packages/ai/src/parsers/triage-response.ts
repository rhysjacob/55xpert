import type { DetectedPanel, DamageAssessmentOutput } from '../interfaces/damage-assessor';
import type { DamageType, DamageSeverity, RepairMethod, TriageConfidence } from '@corexpert/core';

interface RawAiResponse {
  panels?: RawPanel[];
  imageFindings?: RawImageFinding[];
  overallConfidence?: string;
  summary?: string;
  requiresHumanReview?: boolean;
}

interface RawPanel {
  panelName?: string;
  fromImageNumber?: number;
  damageType?: string;
  severity?: string;
  repairMethod?: string;
  confidenceScore?: number;
  description?: string;
  sizeEstimateCm?: number;
  sizeConfidence?: number;
}

interface RawImageFinding {
  imageNumber?: number;
  end?: string;
  showsDamage?: boolean;
}

/**
 * Drop panels placed at an end of the vehicle that no photograph supports.
 *
 * The model records, per image, which end it is looking at and whether that
 * image shows damage. When it cannot orient a close-up it says UNCLEAR — and
 * then, repeatedly, names the panel `rear_*` anyway. On CX-20260816-FPE2 the
 * only REAR image was the plate shot with no damage on it, both FRONT images
 * showed the damaged bumper, and it still returned a 35cm `rear_bumper` off the
 * UNCLEAR close-up. Telling it not to guess did not stop it guessing, so the
 * check is made here instead of asked for in the prompt.
 *
 * Deliberately narrow. A panel is dropped only when its cited image is UNCLEAR,
 * NO image of the claimed end shows any damage, and some image of the opposite
 * end does — i.e. the claim has zero photographic support and the alternative
 * has direct support. Panels cited from an image the model DID orient are left
 * alone even if they look odd; that is a judgement about the photograph, not a
 * contradiction of it.
 *
 * The panel is removed rather than reassigned: the evidence says "not that end",
 * which is not the same as knowing the right one, and inventing a panel name is
 * worse than omitting one. Anything dropped forces human review, so the case
 * reaches an Xpert rather than being quietly priced.
 */
function dropUnsupportedEnds(
  panels: DetectedPanel[],
  rawPanels: RawPanel[],
  findings: RawImageFinding[],
): { panels: DetectedPanel[]; dropped: number } {
  if (findings.length === 0) return { panels, dropped: 0 };

  const damageAt = (end: string) =>
    findings.some((f) => f.end === end && f.showsDamage === true);

  // The end can sit anywhere in the name — `front_bumper` but also
  // `nearside_rear_quarter`, `offside_tail_light`. Matching only a prefix let a
  // `nearside_rear_quarter` off an unclear close-up straight through.
  const endOf = (panelName: string): 'FRONT' | 'REAR' | undefined => {
    const parts = panelName.split('_');
    if (parts.includes('front') || parts.includes('headlight') || parts.includes('grille')) {
      return 'FRONT';
    }
    if (
      parts.includes('rear') ||
      parts.includes('tailgate') ||
      parts.includes('boot') ||
      (parts.includes('tail') && parts.includes('light'))
    ) {
      return 'REAR';
    }
    return undefined;
  };

  const kept = panels.filter((panel, i) => {
    const claimed = endOf(panel.panelName);
    if (!claimed) return true;

    const cited = rawPanels[i]?.fromImageNumber;
    const finding = findings.find((f) => f.imageNumber === cited);
    if (finding?.end !== 'UNCLEAR') return true;

    const opposite = claimed === 'FRONT' ? 'REAR' : 'FRONT';
    return damageAt(claimed) || !damageAt(opposite);
  });

  return { panels: kept, dropped: panels.length - kept.length };
}

const VALID_DAMAGE_TYPES = new Set(['DENT', 'SCRATCH', 'CRACK', 'SHATTER', 'DEFORMATION', 'PAINT_DAMAGE', 'STRUCTURAL']);
const VALID_SEVERITIES = new Set(['MINOR', 'MODERATE', 'SEVERE']);
// SMART_REPAIR was retired — any legacy/unexpected value maps to REPAIR below.
const VALID_REPAIR_METHODS = new Set(['REPAIR', 'REPLACE', 'BLEND', 'PDR']);
const VALID_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW']);

/** Parse and validate the raw AI response text into a structured output. */
export function parseTriageResponse(
  responseText: string,
  modelId: string,
  confidenceThreshold: number,
): DamageAssessmentOutput {
  let raw: RawAiResponse;

  try {
    // Try to extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    raw = JSON.parse(jsonMatch[0]) as RawAiResponse;
  } catch (error) {
    throw new Error(
      `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (!Array.isArray(raw.panels)) {
    throw new Error('AI response missing panels array');
  }

  // Kept as one array so `panels[i]` and `usable[i]` stay the same panel —
  // dropUnsupportedEnds reads `fromImageNumber` off the raw entry by index.
  const usable = raw.panels.filter((p): p is Required<RawPanel> =>
    typeof p.panelName === 'string' &&
    typeof p.damageType === 'string' &&
    typeof p.severity === 'string' &&
    typeof p.repairMethod === 'string' &&
    typeof p.confidenceScore === 'number' &&
    typeof p.description === 'string',
  );

  const panels: DetectedPanel[] = usable
    .map((p) => {
      const panel: DetectedPanel = {
        panelName: p.panelName,
        damageType: (VALID_DAMAGE_TYPES.has(p.damageType) ? p.damageType : 'SCRATCH') as DamageType,
        severity: (VALID_SEVERITIES.has(p.severity) ? p.severity : 'MODERATE') as DamageSeverity,
        repairMethod: (VALID_REPAIR_METHODS.has(p.repairMethod) ? p.repairMethod : 'REPAIR') as RepairMethod,
        confidenceScore: Math.max(0, Math.min(1, p.confidenceScore)),
        description: p.description,
      };
      // Size fields are optional — only attach when the AI returned usable numbers.
      if (typeof p.sizeEstimateCm === 'number' && Number.isFinite(p.sizeEstimateCm)) {
        panel.sizeEstimateCm = Math.max(0, p.sizeEstimateCm);
      }
      if (typeof p.sizeConfidence === 'number' && Number.isFinite(p.sizeConfidence)) {
        panel.sizeConfidence = Math.max(0, Math.min(1, p.sizeConfidence));
      }
      return panel;
    });

  const overallConfidence = (
    VALID_CONFIDENCE.has(raw.overallConfidence ?? '')
      ? raw.overallConfidence
      : 'LOW'
  ) as TriageConfidence;

  const reconciled = dropUnsupportedEnds(panels, usable, raw.imageFindings ?? []);

  const hasLowConfidence = reconciled.panels.some((p) => p.confidenceScore < confidenceThreshold);
  const hasStructural = reconciled.panels.some((p) => p.damageType === 'STRUCTURAL');
  const requiresHumanReview =
    reconciled.dropped > 0 || (raw.requiresHumanReview ?? (hasLowConfidence || hasStructural));

  return {
    panels: reconciled.panels,
    overallConfidence,
    summary: raw.summary ?? 'Damage assessment completed.',
    requiresHumanReview,
    rawResponse: raw,
    modelId,
  };
}
