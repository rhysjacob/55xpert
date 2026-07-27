// ---------------------------------------------------------------------------
// Total-loss guard (TRX-6). Pure, money-in-pence. A case is a potential total
// loss when the repair estimate is at or above a threshold percentage of the
// vehicle's (pre-accident) value — at which point we won't take the job. Kept
// separate from the panel-only eligibility engine, which is intentionally
// money-free; the triage worker runs this once a price is known.
// ---------------------------------------------------------------------------

export interface TotalLossInput {
  /** Repair estimate, pence (inc VAT). */
  estimatedCostPence: number;
  /** Vehicle pre-accident / market value, pence. */
  vehicleValuePence: number;
  /** Threshold percentage of value at/above which it's a total loss (e.g. 80). */
  thresholdPct: number;
}

export interface TotalLossResult {
  isTotalLoss: boolean;
  /** Estimate as a percentage of value, rounded to 1dp (0 when value unknown). */
  ratioPct: number;
}

/**
 * Assess potential total loss. Returns `isTotalLoss: false` when the value is
 * missing or non-positive — the guard can only fire when a value is known.
 */
export function assessTotalLoss({ estimatedCostPence, vehicleValuePence, thresholdPct }: TotalLossInput): TotalLossResult {
  if (!(vehicleValuePence > 0)) return { isTotalLoss: false, ratioPct: 0 };
  const ratio = (estimatedCostPence / vehicleValuePence) * 100;
  return { isTotalLoss: ratio >= thresholdPct, ratioPct: Math.round(ratio * 10) / 10 };
}
