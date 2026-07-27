import { OrganisationsRepository, NetworkLinksRepository } from '@corexpert/db';
import { targetFromUser } from '@corexpert/core';
import type { User, RepairerMatchTarget, Job, JobMatchInput, VehicleSize } from '@corexpert/core';

const orgs = new OrganisationsRepository();
const networkLinks = new NetworkLinksRepository();

/** Distil a stored `Job` into the facts the matcher filters on. */
export function jobToMatchInput(job: Job): JobMatchInput {
  // Network scoping (TRX-78) applies only to real warranty companies. The
  // default tenant (DEMOTENANT) owns consumer jobs — which are an OPEN pool, not
  // network-restricted — so treat it as un-tenanted here. Without this, TRX-77's
  // stamping of every job with the default tenant would silently exclude all
  // consumer jobs from matching (no org is in the default tenant's network).
  const defaultTenant = process.env['DEFAULT_WARRANTY_COMPANY_ID'] ?? 'demotenant';
  const scopedCompanyId = job.warrantyCompanyId && job.warrantyCompanyId !== defaultTenant
    ? job.warrantyCompanyId
    : undefined;
  return {
    postcode: job.location?.postcode ?? '',
    ...(job.vehicleSummary?.vehicleSize
      ? { vehicleSize: job.vehicleSummary.vehicleSize as VehicleSize }
      : {}),
    repairMethods: (job.repairMethods ?? []) as JobMatchInput['repairMethods'],
    ...(scopedCompanyId ? { warrantyCompanyId: scopedCompanyId } : {}),
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
