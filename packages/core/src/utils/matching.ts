import type { User } from '../types/user';
import type { RepairMethod } from '../types/triage';
import type { VehicleSize } from '../types/vehicle';
import type { RepairerCapability, RepairerStatus } from '../types/organisation';
import { isRepairerMatchable } from '../types/organisation';
import { postcodeMatchesAny, postcodeProximity, outwardCode } from './postcode';

/**
 * Job facts the matcher filters on. Distilled from a `Job` so the engine stays
 * pure (no DB) and testable.
 */
export interface JobMatchInput {
  postcode: string;
  vehicleSize?: VehicleSize;
  repairMethods: RepairMethod[];
  /** When set, only repairers enabled in this company's network match (TRX-78). */
  warrantyCompanyId?: string;
}

/**
 * A repairer resolved to the shape the matcher needs — from an org (preferred)
 * or synthesised from a legacy standalone user (see {@link targetFromUser}).
 */
export interface RepairerMatchTarget {
  organisationId?: string;
  status: RepairerStatus;
  capability: RepairerCapability;
  /** Warranty-company ids this target is linked AND enabled for (TRX-78). */
  enabledNetworks: string[];
}

export interface MatchResult {
  matched: boolean;
  /** Set when unmatched — a short machine reason, useful for admin/debug. */
  reason?: string;
  /** True when the job postcode is inside an explicit coverage area (vs a
   *  nearest-area fallback, TRX-12). */
  exact: boolean;
  /** 0–1 proximity for ranking the matched list (TRX-13). */
  proximity: number;
}

/**
 * How close (0–1) a non-covered job must be to a repairer's base postcode to
 * still surface as a nearest-area fallback (TRX-12). Same area (e.g. base "SW2"
 * vs job "SW1A") clears this; a different area does not.
 */
export const FALLBACK_PROXIMITY_THRESHOLD = 0.5;

/**
 * Decide whether a job reaches a repairer, and how strongly. Order of checks:
 * standing → network scope → capability (vehicle size, repair method) →
 * coverage (explicit area, else nearest-area fallback). All matched repairers
 * see the job simultaneously — fastest-finger acceptance settles it (TRX-11/53).
 */
export function evaluateMatch(job: JobMatchInput, target: RepairerMatchTarget): MatchResult {
  const miss = (reason: string): MatchResult => ({ matched: false, reason, exact: false, proximity: 0 });

  if (!isRepairerMatchable(target.status)) return miss('not-active');

  // Network scope: a tenanted job only reaches its company's enabled network.
  if (job.warrantyCompanyId && !target.enabledNetworks.includes(job.warrantyCompanyId)) {
    return miss('not-in-network');
  }

  // Vehicle size: if the job names a size and the target restricts sizes, it must be listed.
  const sizes = target.capability.vehicleSizes ?? [];
  if (job.vehicleSize && sizes.length > 0 && !sizes.includes(job.vehicleSize)) {
    return miss('vehicle-size');
  }

  // Repair method: need at least one overlap when the target restricts methods.
  const methods = target.capability.repairMethods ?? [];
  if (methods.length > 0 && job.repairMethods.length > 0) {
    const overlap = job.repairMethods.some((m) => methods.includes(m));
    if (!overlap) return miss('repair-method');
  }

  // Coverage: explicit area match, else nearest-area fallback by base proximity.
  const base = target.capability.basePostcode;
  const exact = postcodeMatchesAny(job.postcode, target.capability.coverageAreas ?? []);
  const proximity = base ? postcodeProximity(base, job.postcode) : exact ? 1 : 0;

  if (exact) return { matched: true, exact: true, proximity };
  if (base && proximity >= FALLBACK_PROXIMITY_THRESHOLD) {
    return { matched: true, exact: false, proximity };
  }
  return miss('out-of-area');
}

/**
 * Rank matched jobs for a repairer: exact-area matches first, then by proximity
 * (nearest area), then most-recently published (stable-ish) (TRX-13).
 */
export function compareByMatch(
  a: { exact: boolean; proximity: number; publishedAt?: string },
  b: { exact: boolean; proximity: number; publishedAt?: string },
): number {
  if (a.exact !== b.exact) return a.exact ? -1 : 1;
  if (a.proximity !== b.proximity) return b.proximity - a.proximity;
  return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
}

/**
 * Adapt a legacy standalone repairer `User` (no organisation) into a match
 * target: coverage becomes the outward code of their own postcode, capability
 * comes from their preferences, and standing maps from the verified/active
 * booleans. Returns null if the user isn't a usable repairer.
 */
export function targetFromUser(user: User): RepairerMatchTarget | null {
  const profile = user.repairer;
  if (!profile) return null;
  const prefs = user.preferences;
  const coverageAreas = profile.postcode ? [outwardCode(profile.postcode)] : [];
  return {
    ...(user.organisationId ? { organisationId: user.organisationId } : {}),
    status: user.isActive && profile.isVerified ? 'ACTIVE' : 'PENDING',
    capability: {
      vehicleSizes: prefs?.vehicleSizes ?? [],
      repairMethods: prefs?.repairMethods ?? [],
      coverageAreas,
      ...(profile.postcode ? { basePostcode: profile.postcode } : {}),
    },
    // Legacy standalone repairers belong to no per-company network.
    enabledNetworks: [],
  };
}
