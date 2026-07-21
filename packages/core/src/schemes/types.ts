import type { PanelName } from '../constants/panels';
import type { MatrixPaintCategory, MatrixChargeKey } from '../constants/matrix-prices';

/**
 * A "warranty scheme" bundles the full ruleset for one work-provider / warranty
 * company: the work-acceptance (eligibility) rules and the repair-pricing matrix.
 * Swapping the active scheme swaps both, without touching the engines that
 * consume them (`evaluateEligibility`, the matrix calculator).
 */

/** Work-acceptance thresholds for a scheme. */
export interface EligibilityRules {
  /** Maximum number of damaged panels accepted. */
  maxDamagedPanels: number;
  /** Panels never worked on (e.g. bonnet, roof). */
  excludedPanels: readonly PanelName[];
  /** Maximum damage size accepted (longest dimension, cm). */
  maxDamageCm: number;
  /** Symmetric band around maxDamageCm treated as borderline → refer. */
  damageSizeBorderlineCm: number;
  /** Minimum AI size-confidence (0-1) to trust a size estimate; below → refer. */
  minSizeConfidence: number;
  /** Refer a full REPLACE to an Xpert rather than auto-price it. */
  referOnReplace: boolean;
  /** Refer SEVERE damage to an Xpert rather than auto-price it. */
  referOnSevere: boolean;
}

/** Repair-pricing matrix for a scheme (all amounts in pence, ex-VAT). */
export interface MatrixConfig {
  /** Version stamp for reproducibility of stored quotes. */
  version: string;
  /** VAT rate as a decimal (e.g. 0.2). */
  vatRate: number;
  /** Price per {1..4 panel job} × paint category. */
  panelMatrix: Record<1 | 2 | 3 | 4, Partial<Record<MatrixPaintCategory, number>>>;
  /** Bumper row prices by category. */
  bumperMatrix: Partial<Record<MatrixPaintCategory, number>>;
  /** Flat mirror-cover / trim charge. */
  mirrorCoverPrice: number;
  /** Misc/fitting charge amounts by key. */
  charges: Record<MatrixChargeKey, number>;
  /** ADAS calibration / subcontractor uplift as a decimal (e.g. 0.15). */
  adasCalibrationUplift: number;
  /** Flat commercial-vehicle service charge. */
  commercialServiceCharge: number;
}

export interface WarrantyScheme {
  id: string;
  name: string;
  eligibility: EligibilityRules;
  matrix: MatrixConfig;
}
