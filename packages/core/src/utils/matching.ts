import type { User } from '../types/user';
import type { RepairMethod } from '../types/triage';

export interface MatchCriteria {
  postcode: string;
  vehicleSize: string;
  repairMethods: string[];
}

/**
 * Filter repairers who match the job criteria.
 * For MVP: simple matching on vehicle size and repair methods.
 * Distance filtering based on postcode is stubbed (always matches).
 */
export function matchRepairers(repairers: User[], criteria: MatchCriteria): User[] {
  return repairers.filter((repairer) => {
    if (!repairer.preferences || !repairer.isActive) return false;
    if (!repairer.repairer?.isVerified) return false;

    // Vehicle size filter
    const acceptedSizes = repairer.preferences.vehicleSizes ?? [];
    if (acceptedSizes.length > 0 && !acceptedSizes.includes(criteria.vehicleSize)) {
      return false;
    }

    // Repair methods filter
    const acceptedMethods = repairer.preferences.repairMethods ?? [];
    if (acceptedMethods.length > 0) {
      const hasMatchingMethod = criteria.repairMethods.some(
        (m) => acceptedMethods.includes(m as RepairMethod),
      );
      if (!hasMatchingMethod) return false;
    }

    // Distance filter (stubbed for MVP — always passes)
    // TODO: Implement postcode-based distance calculation

    return true;
  });
}
