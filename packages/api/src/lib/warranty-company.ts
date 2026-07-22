import { WarrantyCompaniesRepository } from '@corexpert/db';
import { getScheme } from '@corexpert/core';
import type { WarrantyScheme } from '@corexpert/core';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Resolve a company's ruleset at runtime. Multi-tenancy phase 1: prefer the
// stored per-company scheme; fall back to the hardcoded seed template (and
// ultimately the default scheme) so nothing breaks before/if a company has been
// onboarded into the table. Cached briefly per Lambda container.
// ---------------------------------------------------------------------------

const companies = new WarrantyCompaniesRepository();

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { scheme: WarrantyScheme; expires: number }>();

/**
 * The WarrantyScheme (id, name, eligibility, matrix) for a company.
 *
 * Looks the company up in the warranty-companies table; if present it returns
 * that stored ruleset. Otherwise it falls back to the hardcoded scheme of the
 * same id (seed template), or the default scheme — so triage/pricing keep
 * working identically until a company is onboarded, then pick up its data.
 */
export async function getSchemeForCompany(companyId: string | undefined): Promise<WarrantyScheme> {
  const id = companyId ?? '';
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expires > now) return hit.scheme;

  let scheme: WarrantyScheme;
  try {
    const company = id ? await companies.getById(id) : undefined;
    if (company && company.status === 'ACTIVE') {
      scheme = {
        id: company.warrantyCompanyId,
        name: company.name,
        eligibility: company.scheme.eligibility,
        matrix: company.scheme.matrix,
      };
    } else {
      scheme = getScheme(id); // seed template / default
    }
  } catch (err) {
    // Never let a config lookup break triage — fall back to the hardcoded scheme.
    logger.warn('getSchemeForCompany failed; using seed scheme', { companyId: id, err: String(err) });
    scheme = getScheme(id);
  }

  cache.set(id, { scheme, expires: now + CACHE_TTL_MS });
  return scheme;
}
