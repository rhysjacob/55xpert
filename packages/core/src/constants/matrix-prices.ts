/**
 * Structural definitions for the repair matrix — the categories, charge keys and
 * display labels shared across ALL warranty schemes. The actual PRICES (grid,
 * charge amounts, VAT, uplifts) live per-scheme in `schemes/` as a MatrixConfig,
 * so different warranty companies can carry different numbers with the same shape.
 */

/** Paint treatment columns of the matrix. */
export const MatrixPaintCategory = {
  /** "Local Paint" — restricted to bumpers (<25% paint, billed with a panel) and mirror covers. */
  LOCAL_PAINT: 'LOCAL_PAINT',
  /** "Paint" — paint only; restricted to new/replacement parts. */
  PAINT: 'PAINT',
  /** "Repair & Paint" — standard body repair plus paint. */
  REPAIR_PAINT: 'REPAIR_PAINT',
  /** "Flatline Repair & Paint" — severe dents needing specialist flatline dent pull. */
  FLATLINE_REPAIR_PAINT: 'FLATLINE_REPAIR_PAINT',
} as const;
export type MatrixPaintCategory =
  (typeof MatrixPaintCategory)[keyof typeof MatrixPaintCategory];

/** Human-readable labels for the paint categories (used on quotes/invoices). */
export const MATRIX_CATEGORY_LABELS: Record<MatrixPaintCategory, string> = {
  LOCAL_PAINT: 'Local Paint',
  PAINT: 'Paint',
  REPAIR_PAINT: 'Repair & Paint',
  FLATLINE_REPAIR_PAINT: 'Flatline Repair & Paint',
};

/** Canonical set of misc/fitting charge keys. Amounts are per-scheme. */
export const MATRIX_CHARGE_KEYS = [
  'BUMPER_AND_FITTING_KITS',
  'BOLT_ON_WING',
  'WINGMIRROR',
  'TRIM',
  'REPAIR_METHODS',
  'ADAS_METHODS',
  'LIGHT_CLUSTER',
  'FAILED_CALL_OUT',
  'MOBILE_CHARGE',
  'EPA',
  'PARTS_DISTRIBUTION',
  'PRE_DIAGNOSTICS',
  'POST_DIAGNOSTICS',
  'REPAIRS_INSIDE_M25',
  'PANEL_REPAIR_SUNDRIES',
  'CAR_CARE_KIT',
  'PLASTIC_REPAIR_KIT',
  'SPECIALIST_PAINT',
  'FIRSTLOOK_AI',
] as const;
export type MatrixChargeKey = (typeof MATRIX_CHARGE_KEYS)[number];
