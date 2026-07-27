export const VehicleSize = {
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  LARGE: 'LARGE',
  VAN: 'VAN',
  SUV: 'SUV',
} as const;
export type VehicleSize = (typeof VehicleSize)[keyof typeof VehicleSize];

/**
 * Provenance / history flags derived from an Experian AutoCheck lookup.
 * Captured for display and audit — these do NOT currently affect eligibility
 * or any business logic. Each flag is our interpretation of the AutoCheck
 * response (mostly "quantity > 0" markers).
 */
export interface VehicleProvenance {
  isStolen?: boolean;
  isScrapped?: boolean;
  /** Recorded as a write-off / has condition (damage) markers. */
  isWrittenOff?: boolean;
  /** Has outstanding finance records. */
  hasOutstandingFinance?: boolean;
  isImported?: boolean;
  isExported?: boolean;
  /** Colour has changed at least once. */
  colourChanged?: boolean;
  /** Registration (cherished/personalised plate) has changed. */
  plateChanged?: boolean;
}

export interface Vehicle {
  registrationNo?: string;
  make?: string;
  model?: string;
  variant?: string;
  year?: number;
  colour?: string;
  vehicleSize?: VehicleSize;
  provenance?: VehicleProvenance;
  /**
   * Pre-accident / market value in pence. Used by the total-loss guard (TRX-6):
   * a repair estimate at or above the scheme's threshold percentage of this
   * value is auto-rejected. Typically supplied by the warranty company on an
   * ingested job; absent for consumer cases, in which case the guard is skipped.
   */
  valuePence?: number;
}

export interface VehicleLookupResponse {
  found: boolean;
  vehicle?: Vehicle;
  /** Provenance flags, surfaced alongside the vehicle for display. */
  provenance?: VehicleProvenance;
}
