import type { DetectedPanel, DamageAssessmentOutput } from '../interfaces/damage-assessor';
import type { DamageType, DamageSeverity, RepairMethod, TriageConfidence } from '@corexpert/core';

interface RawAiResponse {
  panels?: RawPanel[];
  overallConfidence?: string;
  summary?: string;
  requiresHumanReview?: boolean;
}

interface RawPanel {
  panelName?: string;
  damageType?: string;
  severity?: string;
  repairMethod?: string;
  confidenceScore?: number;
  description?: string;
  sizeEstimateCm?: number;
  sizeConfidence?: number;
}

const VALID_DAMAGE_TYPES = new Set(['DENT', 'SCRATCH', 'CRACK', 'SHATTER', 'DEFORMATION', 'PAINT_DAMAGE', 'STRUCTURAL']);
const VALID_SEVERITIES = new Set(['MINOR', 'MODERATE', 'SEVERE']);
const VALID_REPAIR_METHODS = new Set(['REPAIR', 'REPLACE', 'BLEND', 'PDR', 'SMART_REPAIR']);
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

  const panels: DetectedPanel[] = raw.panels
    .filter((p): p is Required<RawPanel> =>
      typeof p.panelName === 'string' &&
      typeof p.damageType === 'string' &&
      typeof p.severity === 'string' &&
      typeof p.repairMethod === 'string' &&
      typeof p.confidenceScore === 'number' &&
      typeof p.description === 'string',
    )
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

  const hasLowConfidence = panels.some((p) => p.confidenceScore < confidenceThreshold);
  const hasStructural = panels.some((p) => p.damageType === 'STRUCTURAL');
  const requiresHumanReview = raw.requiresHumanReview ?? (hasLowConfidence || hasStructural);

  return {
    panels,
    overallConfidence,
    summary: raw.summary ?? 'Damage assessment completed.',
    requiresHumanReview,
    rawResponse: raw,
    modelId,
  };
}
