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
  SMART_REPAIR: 'SMART_REPAIR',
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
  labourHours: number;
  labourCost: number;
  partsCost: number;
  paintCost: number;
  subtotal: number;
}

export interface TriageResult {
  overallConfidence: TriageConfidence;
  requiresXpertReview: boolean;
  aiModelId: string;
  aiRawResponse?: unknown;
  summary: string;
  totalEstimatedCost: number;
  totalLabourHours: number;
  totalPartsCost: number;
  totalPaintCost: number;
  panels: DamagePanel[];
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
