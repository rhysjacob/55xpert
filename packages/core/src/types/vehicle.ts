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
}

export interface VehicleLookupResponse {
  found: boolean;
  vehicle?: Vehicle;
  /** Provenance flags, surfaced alongside the vehicle for display. */
  provenance?: VehicleProvenance;
}
