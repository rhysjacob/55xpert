import { OrganisationsRepository, NetworkLinksRepository } from '@corexpert/db';
import { targetFromUser } from '@corexpert/core';
import type { User, RepairerMatchTarget, Job, JobMatchInput, VehicleSize } from '@corexpert/core';

const orgs = new OrganisationsRepository();
const networkLinks = new NetworkLinksRepository();

/** Distil a stored `Job` into the facts the matcher filters on. */
export function jobToMatchInput(job: Job): JobMatchInput {
  // Every job belongs to a tenant and reaches ONLY that tenant's enabled
  // network (TRX-78) — no exceptions. A repairer must be enrolled in the
  // tenant's network (admin-managed, TRX-23) to receive its jobs.
  return {
    postcode: job.location?.postcode ?? '',
    ...(job.vehicleSummary?.vehicleSize
      ? { vehicleSize: job.vehicleSummary.vehicleSize as VehicleSize }
      : {}),
    repairMethods: (job.repairMethods ?? []) as JobMatchInput['repairMethods'],
    ...(job.warrantyCompanyId ? { warrantyCompanyId: job.warrantyCompanyId } : {}),
    ...(job.location?.lat != null ? { lat: job.location.lat } : {}),
    ...(job.location?.lng != null ? { lng: job.location.lng } : {}),
  };
}

/**
 * Resolve a repairer `User` into the {@link RepairerMatchTarget} the matching
 * engine needs. If the user belongs to an organisation, capability + coverage +
 * standing come from the org and `enabledNetworks` from its network links
 * (TRX-78). A legacy standalone repairer (no org) is synthesised from their own
 * profile/preferences and belongs to no network. Returns null if the user
 * isn't a usable repairer.
 */
export async function resolveMatchTarget(user: User): Promise<RepairerMatchTarget | null> {
  if (user.organisationId) {
    const org = await orgs.getById(user.organisationId);
    if (org) {
      return {
        organisationId: org.organisationId,
        status: org.status,
        capability: org.capability,
        enabledNetworks: await networkLinks.enabledCompaniesForOrg(org.organisationId),
      };
    }
    // Org id set but org missing — fall through to the legacy view rather than
    // silently excluding the repairer.
  }
  return targetFromUser(user);
}
