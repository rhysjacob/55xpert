import type { FraudAssessment } from './fraud';

export const TriageConfidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type TriageConfidence = (typeof TriageConfidence)[keyof typeof TriageConfidence];

export const RepairMethod = {
  REPAIR: 'REPAIR',
  REPLACE: 'REPLACE',
  BLEND: 'BLEND',
  PDR: 'PDR',
} as const;
export type RepairMethod = (typeof RepairMethod)[keyof typeof RepairMethod];

export const DamageSeverity = {
  MINOR: 'MINOR',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
} as const;
export type DamageSeverity = (typeof DamageSeverity)[keyof typeof DamageSeverity];

export const DamageType = {
  DENT: 'DENT',
  SCRATCH: 'SCRATCH',
  CRACK: 'CRACK',
  SHATTER: 'SHATTER',
  DEFORMATION: 'DEFORMATION',
  PAINT_DAMAGE: 'PAINT_DAMAGE',
  STRUCTURAL: 'STRUCTURAL',
} as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

export const ImageType = {
  REGISTRATION_PLATE: 'REGISTRATION_PLATE',
  DAMAGE_ANGLE_1: 'DAMAGE_ANGLE_1',
  DAMAGE_ANGLE_2: 'DAMAGE_ANGLE_2',
  DAMAGE_ANGLE_3: 'DAMAGE_ANGLE_3',
} as const;
export type ImageType = (typeof ImageType)[keyof typeof ImageType];

/**
 * The canonical order of the upload slots — plate first, then the damage angles
 * from wide to context.
 *
 * Stored order is NOT this order. `addImage` appends one row per completed
 * upload, so `case.images` reflects whichever PUT finished first. Any screen
 * showing the set should sort with {@link compareImageSlot} rather than render
 * the array as stored, or the same case shows its photos in a different order
 * to different people.
 */
export const IMAGE_SLOT_ORDER: readonly ImageType[] = [
  ImageType.REGISTRATION_PLATE,
  ImageType.DAMAGE_ANGLE_1,
  ImageType.DAMAGE_ANGLE_2,
  ImageType.DAMAGE_ANGLE_3,
];

/**
 * What each slot is called, for humans.
 *
 * The single source of truth. Every screen previously re-derived its caption
 * inline as `imageType.replace(/_/g, ' ')`, which rendered the raw enum
 * ("DAMAGE ANGLE 1"), matched the upload screen's wording nowhere, and had
 * drifted into three different casings across the apps.
 */
export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  REGISTRATION_PLATE: 'Registration plate',
  DAMAGE_ANGLE_1: 'Damage — angle 1 (wide shot)',
  DAMAGE_ANGLE_2: 'Damage — angle 2 (close-up)',
  DAMAGE_ANGLE_3: 'Damage — angle 3 (context)',
};

/** Extra guidance shown only while choosing a photo for the slot. */
export const IMAGE_TYPE_UPLOAD_HINTS: Record<ImageType, string> = {
  REGISTRATION_PLATE: 'Straight on, with the number plate readable.',
  DAMAGE_ANGLE_1: 'The whole damaged panel, from a few steps back.',
  DAMAGE_ANGLE_2: 'Close in on the damage itself.',
  DAMAGE_ANGLE_3: 'Wider still, showing where on the vehicle the damage sits.',
};

/** Human label for a slot, tolerating any unrecognised value from storage. */
export function imageTypeLabel(imageType: string): string {
  return IMAGE_TYPE_LABELS[imageType as ImageType] ?? imageType.replace(/_/g, ' ');
}

/** Sort comparator putting images into {@link IMAGE_SLOT_ORDER}; unknowns last. */
export function compareImageSlot(a: string, b: string): number {
  const rank = (t: string) => {
    const i = (IMAGE_SLOT_ORDER as readonly string[]).indexOf(t);
    return i === -1 ? IMAGE_SLOT_ORDER.length : i;
  };
  return rank(a) - rank(b);
}

export const XpertDecision = {
  APPROVED: 'APPROVED',
  ADJUSTED: 'ADJUSTED',
  REJECTED: 'REJECTED',
} as const;
export type XpertDecision = (typeof XpertDecision)[keyof typeof XpertDecision];

export interface DamagePanel {
  panelName: string;
  damageType: DamageType;
  severity: DamageSeverity;
  repairMethod: RepairMethod;
  confidenceScore: number;
  description: string;
  /** Estimated longest dimension of the damage in cm (undefined if AI couldn't judge scale). */
  sizeEstimateCm?: number;
  /** AI confidence (0-1) in the size estimate. */
  sizeConfidence?: number;
  // Per-panel cost fields are legacy (granular calculator). The matrix prices
  // per-job, not per-panel, so these are optional and unset under matrix pricing.
  labourHours?: number;
  labourCost?: number;
  partsCost?: number;
  paintCost?: number;
  subtotal?: number;
}

export const EligibilityVerdict = {
  /** Passes all work-acceptance rules — proceed to pricing/publish. */
  ELIGIBLE: 'ELIGIBLE',
  /** Borderline or undeterminable — route to an Xpert to decide. */
  REFER: 'REFER',
  /** Breaks a hard rule — we will not work on this case. */
  INELIGIBLE: 'INELIGIBLE',
} as const;
export type EligibilityVerdict = (typeof EligibilityVerdict)[keyof typeof EligibilityVerdict];

/** A single reason contributing to an eligibility verdict. */
export interface EligibilityReason {
  rule: 'PANEL_COUNT' | 'DAMAGE_SIZE' | 'EXCLUDED_PANEL' | 'SIZE_UNKNOWN' | 'NON_STANDARD_REPAIR' | 'TOTAL_LOSS';
  verdict: EligibilityVerdict;
  detail: string;
}

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  reasons: EligibilityReason[];
}

/** A single priced line from the repair matrix. */
export interface PriceLineItem {
  code: string;
  label: string;
  amount: number;
}

export interface TriageResult {
  overallConfidence: TriageConfidence;
  requiresXpertReview: boolean;
  /** Work-acceptance outcome from the eligibility engine. */
  eligibility?: EligibilityResult;
  aiModelId: string;
  aiRawResponse?: unknown;
  summary: string;
  /**
   * Matrix price (inc VAT), in pence. Only populated when the case is ELIGIBLE
   * and priced from the matrix; 0 for INELIGIBLE cases and cases awaiting Xpert.
   */
  totalEstimatedCost: number;
  /** Matrix version the price was computed against. */
  matrixVersion?: string;
  /** Matrix line items making up the price (ex-VAT), for display. */
  priceLineItems?: PriceLineItem[];
  panels: DamagePanel[];
  /** Fraud-risk verdict. A non-LOW band badges the case and forces Xpert review. */
  fraudAssessment?: FraudAssessment;
}

export interface XpertReview {
  reviewId: string;
  xpertUserId: string;
  decision: XpertDecision;
  notes?: string;
  adjustedPanels?: DamagePanel[];
  adjustedCost?: number;
  reviewedAt: string;
}
