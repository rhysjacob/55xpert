import type { VehicleSize } from '../types/vehicle';

/**
 * Default labour rates in pence per hour by vehicle size.
 * These are indicative UK bodyshop rates for the MVP.
 */
export const DEFAULT_LABOUR_RATES: Record<VehicleSize, number> = {
  SMALL: 4000,   // £40/hr
  MEDIUM: 4500,  // £45/hr
  LARGE: 5000,   // £50/hr
  VAN: 4500,     // £45/hr
  SUV: 5500,     // £55/hr
};

/** VAT rate as a decimal (20%). */
export const VAT_RATE = 0.2;

/** Sundries allowance as a percentage of subtotal. */
export const SUNDRIES_RATE = 0.03;
