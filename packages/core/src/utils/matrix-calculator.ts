import { ValidationError } from '../errors';
import { humanize } from './humanize';
import {
  MatrixPaintCategory,
  MATRIX_CATEGORY_LABELS,
  type MatrixChargeKey,
} from '../constants/matrix-prices';
import type { MatrixConfig } from '../schemes/types';

// ---------------------------------------------------------------------------
// Pure quote: correct given explicit selections. No inference happens here.
// ---------------------------------------------------------------------------

export interface MatrixQuoteInput {
  /** Number of standard (non-bumper, non-mirror) panels, 0-4. */
  panelCount: 0 | 1 | 2 | 3 | 4;
  /** Paint category for the standard panels; required when panelCount > 0. */
  panelCategory?: MatrixPaintCategory;
  /** Bumper treatment, if a bumper is part of the job. */
  bumper?: MatrixPaintCategory;
  /** How many bumpers get the {@link bumper} treatment (defaults to 1). */
  bumperCount?: number;
  /** Include the mirror-cover / trim charge. */
  mirrorCover?: boolean;
  /** How many mirror covers to charge (defaults to 1 when mirrorCover is set). */
  mirrorCount?: number;
  /** Miscellaneous fitting/parts/admin charges to add. */
  charges?: MatrixChargeKey[];
  /** Apply the +15% ADAS calibration / subcontractor uplift to the ex-VAT subtotal. */
  adasCalibration?: boolean;
  /** Add the flat commercial-vehicle service charge. */
  commercialVehicle?: boolean;
}

export interface MatrixLineItem {
  code: string;
  label: string;
  amount: number;
}

export interface MatrixQuote {
  matrixVersion: string;
  lineItems: MatrixLineItem[];
  /** Ex-VAT total after uplifts. */
  subtotal: number;
  vat: number;
  /** Inc-VAT total. */
  total: number;
}

/** Compute a matrix quote (pence) from explicit selections against a scheme's matrix. */
export function calculateMatrixQuote(input: MatrixQuoteInput, matrix: MatrixConfig): MatrixQuote {
  const lineItems: MatrixLineItem[] = [];

  // Base panel job.
  if (input.panelCount > 0) {
    if (!input.panelCategory) {
      throw new ValidationError('panelCategory is required when panelCount > 0');
    }
    const price = matrix.panelMatrix[input.panelCount as 1 | 2 | 3 | 4][input.panelCategory];
    if (price === undefined) {
      throw new ValidationError(
        `No matrix price for ${input.panelCount}-panel ${input.panelCategory}`,
      );
    }
    const panelWord = input.panelCount === 1 ? 'panel' : 'panels';
    lineItems.push({
      code: `PANEL_${input.panelCount}_${input.panelCategory}`,
      label: `${input.panelCount} ${panelWord} — ${MATRIX_CATEGORY_LABELS[input.panelCategory]}`,
      amount: price,
    });
  }

  // Bumper row. Each bumper is a separate charge, so multiply by the count.
  if (input.bumper) {
    const price = matrix.bumperMatrix[input.bumper];
    if (price === undefined) {
      throw new ValidationError(`No matrix bumper price for ${input.bumper}`);
    }
    const count = Math.max(1, input.bumperCount ?? 1);
    const prefix = count > 1 ? `${count}× ` : '';
    lineItems.push({
      code: `BUMPER_${input.bumper}`,
      label: `${prefix}Bumper — ${MATRIX_CATEGORY_LABELS[input.bumper]}`,
      amount: price * count,
    });
  }

  // Mirror cover / trim — one charge per mirror.
  if (input.mirrorCover) {
    const count = Math.max(1, input.mirrorCount ?? 1);
    const prefix = count > 1 ? `${count}× ` : '';
    lineItems.push({
      code: 'MIRROR_COVER',
      label: `${prefix}Paint/Repair Mirror Cover`,
      amount: matrix.mirrorCoverPrice * count,
    });
  }

  // Misc charges.
  for (const key of input.charges ?? []) {
    lineItems.push({ code: key, label: humanize(key), amount: matrix.charges[key] });
  }

  // Commercial vehicle flat charge.
  if (input.commercialVehicle) {
    lineItems.push({ code: 'COMMERCIAL_SERVICE_CHARGE', label: 'Commercial vehicle service charge', amount: matrix.commercialServiceCharge });
  }

  const base = lineItems.reduce((sum, li) => sum + li.amount, 0);

  // ADAS calibration uplift applies to the ex-VAT subtotal.
  const adasUplift = input.adasCalibration ? Math.round(base * matrix.adasCalibrationUplift) : 0;
  if (adasUplift > 0) {
    lineItems.push({ code: 'ADAS_CALIBRATION_UPLIFT', label: 'ADAS calibration', amount: adasUplift });
  }

  const subtotal = base + adasUplift;
  const vat = Math.round(subtotal * matrix.vatRate);

  return { matrixVersion: matrix.version, lineItems, subtotal, vat, total: subtotal + vat };
}

// ---------------------------------------------------------------------------
// Derivation: map eligible panels → matrix selections.
//
// The matrix is the SOLE source of price. We only ever reach here for a job the
// eligibility engine has already accepted — meaning every damaged panel is a
// standard "Repair & Paint" (no REPLACE, no SEVERE, ≤4 panels, no excluded
// panels, within the size limit). So the mapping is literal and adds NOTHING:
//   - standard body panels  → the 1–4 panel "Repair & Paint" grid
//   - bumper(s)             → the bumper "Repair & Paint" row
//   - mirror(s)             → the mirror-cover flat charge
// No misc charges, ADAS, mobile, diagnostics or uplifts are invented here.
// ---------------------------------------------------------------------------

export interface MatrixPanelInput {
  panelName: string;
}

const BUMPER_PANELS = new Set(['front_bumper', 'rear_bumper']);
const MIRROR_PANELS = new Set(['nearside_mirror', 'offside_mirror']);

/** Build the (literal) matrix selection for an already-eligible job. */
export function deriveMatrixInput(panels: MatrixPanelInput[]): MatrixQuoteInput {
  const standard = panels.filter(
    (p) => !BUMPER_PANELS.has(p.panelName) && !MIRROR_PANELS.has(p.panelName),
  );
  const bumperCount = panels.filter((p) => BUMPER_PANELS.has(p.panelName)).length;
  const mirrorCount = panels.filter((p) => MIRROR_PANELS.has(p.panelName)).length;

  const input: MatrixQuoteInput = { panelCount: standard.length as 0 | 1 | 2 | 3 | 4 };
  if (standard.length > 0) input.panelCategory = MatrixPaintCategory.REPAIR_PAINT;
  if (bumperCount > 0) {
    input.bumper = MatrixPaintCategory.REPAIR_PAINT;
    input.bumperCount = bumperCount;
  }
  if (mirrorCount > 0) {
    input.mirrorCover = true;
    input.mirrorCount = mirrorCount;
  }

  return input;
}

/** Derive the matrix selection from eligible panels and price it against a scheme's matrix. */
export function quoteFromPanels(panels: MatrixPanelInput[], matrix: MatrixConfig): MatrixQuote {
  return calculateMatrixQuote(deriveMatrixInput(panels), matrix);
}
