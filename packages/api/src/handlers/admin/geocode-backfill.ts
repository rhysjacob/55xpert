import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { OrganisationsRepository, JobsRepository } from '@corexpert/db';
import { normalisePostcode } from '@corexpert/core';
import { geocodePostcodesBulk } from '../../lib/geocode';

const orgs = new OrganisationsRepository();
const jobs = new JobsRepository();

/**
 * One-off (re-runnable) backfill: geocode existing organisations and OPEN jobs
 * that have a postcode but no coordinates yet, using the postcodes.io bulk API.
 * Admin-only. Idempotent — rows that already have coords (or resolve to nothing)
 * are skipped, so it's safe to run again.
 */
async function backfillHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  // --- Organisations ---
  const allOrgs = await orgs.list();
  const orgsNeeding = allOrgs.filter((o) => o.capability?.basePostcode && o.capability.baseLat == null);
  const orgCoords = await geocodePostcodesBulk(orgsNeeding.map((o) => o.capability.basePostcode!));
  let orgsUpdated = 0;
  for (const o of orgsNeeding) {
    const c = orgCoords.get(normalisePostcode(o.capability.basePostcode!));
    if (!c) continue;
    await orgs.update(o.organisationId, { capability: { ...o.capability, baseLat: c.lat, baseLng: c.lng } });
    orgsUpdated += 1;
  }

  // --- OPEN jobs (page through the status GSI) ---
  let jobsScanned = 0;
  let jobsUpdated = 0;
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await jobs.listByStatus('OPEN', 100, cursor);
    const needing = page.items.filter((j) => j.location?.postcode && j.location.lat == null);
    jobsScanned += page.items.length;
    if (needing.length) {
      const coords = await geocodePostcodesBulk(needing.map((j) => j.location.postcode));
      for (const j of needing) {
        const c = coords.get(normalisePostcode(j.location.postcode));
        if (!c) continue;
        await jobs.setLocationCoords(j.jobId, c.lat, c.lng);
        jobsUpdated += 1;
      }
    }
    cursor = page.lastKey;
  } while (cursor);

  const result = { orgsScanned: allOrgs.length, orgsUpdated, jobsScanned, jobsUpdated };
  logger.info('Geocode backfill complete', result);
  return ok(result);
}

export const handler = withErrorHandler(backfillHandler);
