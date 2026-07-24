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
/** Repair service specialisms a repairer offers (onboarding capabilities). */
export const RepairerService = {
  SMART: 'SMART',
  BODYSHOP: 'BODYSHOP',
  ALLOY: 'ALLOY',
  GLASS: 'GLASS',
  EV: 'EV',
  ADAS: 'ADAS',
  COSMETIC: 'COSMETIC',
  STRUCTURAL: 'STRUCTURAL',
  MOBILE: 'MOBILE',
  PAINT: 'PAINT',
} as const;
export type RepairerService = (typeof RepairerService)[keyof typeof RepairerService];

export interface RepairerCapability {
  vehicleSizes: VehicleSize[];
  repairMethods: RepairMethod[];
  /** Service specialisms offered (SMART, Bodyshop, Alloy, …) — from onboarding. */
  services?: RepairerService[];
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
/** Business classification captured at onboarding. */
export const BusinessType = {
  INDEPENDENT: 'Independent Repairer',
  MOBILE: 'Mobile Repairer',
  GROUP: 'Group / Multi-site',
  SPECIALIST: 'Specialist',
} as const;
export type BusinessType = (typeof BusinessType)[keyof typeof BusinessType];

/** A repairer's mobile-unit fleet details (onboarding Section E). */
export interface MobileUnitDetails {
  count: number;
  /** Ticked van equipment items (Power Source, Pin Puller, …). */
  equipment: string[];
  equipmentOther?: string;
  fullyEquipped?: boolean;
  yearRound?: boolean;
  needsDriveway?: boolean;
  carParkRoadside?: boolean;
  notes?: string;
}

/**
 * The full repairer onboarding record (spreadsheet "Repairer Onboarding Build
 * Spec"). Coverage postcodes + travel radius + services also mirror onto the
 * org's {@link RepairerCapability} so the matching engine uses them directly;
 * the rest is operational metadata kept here.
 */
export interface RepairerOnboarding {
  travelRadiusMiles?: number;
  preferredJobTypes: string[];
  dailyCapacity?: number;
  capsEnabled?: boolean;
  capsId?: string;
  mobileUnits?: MobileUnitDetails;
  accuracyConfirmed: boolean;
  termsAcceptedAt?: string;
  /** Set once Step 1 is submitted — used to gate the app / show reminders. */
  completedAt?: string;
}

export interface RepairerOrganisation {
  organisationId: string;
  name: string;
  status: RepairerStatus;
  /** Business classification (Independent, Mobile, Group, Specialist). */
  businessType?: BusinessType;
  capability: RepairerCapability;
  /** Onboarding answers (operational + mobile-unit detail + T&Cs). */
  onboarding?: RepairerOnboarding;
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
