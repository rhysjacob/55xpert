import type { VehicleSize } from './vehicle';
import type { RepairMethod } from './triage';

/**
 * Registration / standing of a repairer organisation on the platform (TRX-21).
 * Drives whether the org's members are matchable and can accept jobs; admin
 * moves an org between these (TRX-22 enable/disable cascades to all members).
 */
export const RepairerStatus = {
  /** Signed up, awaiting admin verification/approval. Not yet matchable. */
  PENDING: 'PENDING',
  /** Approved and eligible to be matched to jobs. */
  ACTIVE: 'ACTIVE',
  /** Temporarily withheld from matching (admin toggle, billing hold). */
  SUSPENDED: 'SUSPENDED',
  /** Permanently disabled. */
  DISABLED: 'DISABLED',
} as const;
export type RepairerStatus = (typeof RepairerStatus)[keyof typeof RepairerStatus];

/** An org is matchable to jobs only when ACTIVE. */
export function isRepairerMatchable(status: RepairerStatus | undefined): boolean {
  return status === 'ACTIVE';
}

/**
 * What a repairer can do and where — the knobs the matching engine filters on
 * (TRX-18). Coverage is expressed as UK postcode prefixes (areas/districts,
 * e.g. ["SW", "SE1", "M"]) rather than lat/lng, since we hold no geocoding;
 * see utils/postcode.ts.
 */
export interface RepairerCapability {
  vehicleSizes: VehicleSize[];
  repairMethods: RepairMethod[];
  /** Postcode prefixes this org covers (normalised: uppercase, no spaces). */
  coverageAreas: string[];
  /** Home postcode — used to rank matched jobs by proximity (TRX-13). */
  basePostcode?: string;
  /** Geocoded coordinates of basePostcode (populated best-effort at write). */
  baseLat?: number;
  baseLng?: number;
  /**
   * Fallback coverage radius in km around the base. When the job's area isn't
   * in `coverageAreas`, a repairer still matches if the job is within this
   * radius (real distance) — the geo-powered nearest-area fallback (TRX-12).
   */
  coverageRadiusKm?: number;
}

/**
 * A repairer organisation — the company that groups one or more repairer users
 * (TRX-37, TRX-49, TRX-52). Capability, coverage and registration status live
 * here (org-level) so every member shares one network identity, coverage
 * footprint and standing. Individual logins are `User`s carrying the
 * `organisationId` on their `RepairerProfile`.
 */
export interface RepairerOrganisation {
  organisationId: string;
  name: string;
  status: RepairerStatus;
  capability: RepairerCapability;
  /** The owning/admin user for the org (first signup, or reassigned). */
  primaryContactUserId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A per-warranty-company network membership (TRX-78). A job originating from
 * warranty company X only reaches organisations linked AND enabled for X.
 * Admin toggles these. Composite key (warrantyCompanyId + organisationId),
 * queryable by either side via GSIs.
 */
export interface RepairerNetworkLink {
  warrantyCompanyId: string;
  organisationId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
