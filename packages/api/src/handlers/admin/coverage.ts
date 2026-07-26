import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { TABLES } from '@corexpert/db';
import { postcodeArea, outwardCode, normalisePostcode, isRepairerMatchable } from '@corexpert/core';
import type { Job, User, RepairerOrganisation } from '@corexpert/core';
import { scanAll } from '../../lib/mi-util';

/**
 * Coverage heatmap data (TRX-30): job DEMAND vs repairer SUPPLY, computed at both
 * postcode-AREA level (summary tiles + gap count) and postcode-DISTRICT level (so
 * the map can shade the real district polygons honestly — a repairer covering
 * "SK6" only paints SK6, not the whole SK area).
 *
 * A repairer's coverage entry is either a whole AREA (bare "SK") or a specific
 * DISTRICT ("SK6" / a full postcode). We track those separately so the frontend
 * can colour a district D as covered when either its area is wholesale-covered or
 * D itself is covered. Aggregated in-memory from scans — fine at current scale.
 */
async function coverageHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const [jobs, users, orgs] = await Promise.all([
    scanAll<Pick<Job, 'location'>>(TABLES.JOBS, '#loc', { '#loc': 'location' }),
    scanAll<Pick<User, 'userId' | 'role' | 'organisationId' | 'isActive' | 'repairer'>>(TABLES.USERS, 'userId, #r, organisationId, isActive, repairer', { '#r': 'role' }),
    scanAll<Pick<RepairerOrganisation, 'organisationId' | 'name' | 'status' | 'capability'>>(TABLES.ORGANISATIONS, 'organisationId, #n, #s, capability', { '#n': 'name', '#s': 'status' }),
  ]);
  const orgById = new Map(orgs.map((o) => [o.organisationId, o]));

  const demand = new Map<string, number>();          // by area
  const supply = new Map<string, number>();          // by area (covered by any part)
  const demandByDistrict = new Map<string, number>(); // by outcode, e.g. "SK6"
  const districtSupply = new Map<string, number>();   // repairers covering that exact district
  const areaSupply = new Map<string, number>();       // repairers covering a WHOLE area (bare "SK")
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  // Map points: geocoded job locations (heat layer) + repairer bases (markers).
  const jobPoints: [number, number][] = [];
  const repairerPoints: { lat: number; lng: number; name: string; radiusKm?: number }[] = [];

  // Demand — jobs by area + district (+ coords for the heat layer).
  for (const j of jobs) {
    const pc = j.location?.postcode;
    if (pc) {
      bump(demand, postcodeArea(pc));
      bump(demandByDistrict, outwardCode(pc));
    }
    if (j.location?.lat != null && j.location.lng != null) jobPoints.push([j.location.lat, j.location.lng]);
  }

  // Supply — ACTIVE repairers. Count each once per area/district they cover.
  let activeRepairers = 0;
  for (const u of users) {
    if (u.role !== 'REPAIRER') continue;
    let coverage: string[] = [];
    let baseLat: number | undefined;
    let baseLng: number | undefined;
    let radiusKm: number | undefined;
    let name = 'Repairer';
    if (u.organisationId) {
      const org = orgById.get(u.organisationId);
      if (!org || !isRepairerMatchable(org.status)) continue;
      coverage = org.capability?.coverageAreas ?? [];
      // Prefer the org's geocoded base; fall back to the member's own profile
      // coords (onboarding captures coverage areas, not always a base postcode).
      baseLat = org.capability?.baseLat ?? u.repairer?.lat;
      baseLng = org.capability?.baseLng ?? u.repairer?.lng;
      radiusKm = org.capability?.coverageRadiusKm;
      name = org.name;
    } else {
      // Legacy standalone: matchable when active + verified; covers its own outcode.
      if (!(u.isActive && u.repairer?.isVerified)) continue;
      coverage = u.repairer?.postcode ? [u.repairer.postcode] : [];
      baseLat = u.repairer?.lat;
      baseLng = u.repairer?.lng;
      name = u.repairer?.businessName ?? name;
    }
    activeRepairers += 1;

    // Split each repairer's coverage into whole-areas vs specific districts,
    // deduped so one repairer counts at most once per key.
    const areasCovered = new Set<string>();
    const wholeAreas = new Set<string>();
    const districts = new Set<string>();
    for (const raw of coverage) {
      const entry = normalisePostcode(raw);
      if (!entry) continue;
      const area = postcodeArea(entry);
      if (!area) continue;
      areasCovered.add(area);
      if (/^[A-Z]{1,2}$/.test(entry)) wholeAreas.add(area);
      else districts.add(outwardCode(entry));
    }
    for (const a of areasCovered) bump(supply, a);
    for (const a of wholeAreas) bump(areaSupply, a);
    for (const d of districts) bump(districtSupply, d);

    if (baseLat != null && baseLng != null) {
      repairerPoints.push({ lat: baseLat, lng: baseLng, name, ...(radiusKm != null ? { radiusKm } : {}) });
    }
  }

  // District-level supply: covered if the district itself is covered OR its whole
  // area is wholesale-covered. This is the honest view the map draws.
  const supplyOfDistrict = (dcode: string) => (districtSupply.get(dcode) ?? 0) + (areaSupply.get(postcodeArea(dcode)) ?? 0);
  // Uncovered = a DISTRICT with demand and no coverage (the red polygons). Counted
  // at district level so this matches the map — an area like SK can be "covered"
  // overall (SK4–7) yet still contain an uncovered district (SK1).
  const uncoveredDistricts = [...demandByDistrict.entries()].filter(([dcode, n]) => n > 0 && supplyOfDistrict(dcode) === 0).map(([dcode]) => dcode).sort();

  const areas = [...new Set([...demand.keys(), ...supply.keys()])].map((area) => {
    const d = demand.get(area) ?? 0;
    const s = supply.get(area) ?? 0;
    // An area is flagged uncovered when it holds at least one uncovered-demand district.
    const uncovered = uncoveredDistricts.some((dc) => postcodeArea(dc) === area);
    return { area, demand: d, supply: s, uncovered };
  }).sort((a, b) => b.demand - a.demand || a.supply - b.supply || a.area.localeCompare(b.area));

  return ok({
    areas,
    // District-level maps let the map shade real district polygons. Frontend:
    // supply(D) = districtSupply[D] + areaSupply[area(D)]; covered = supply > 0.
    districts: {
      demand: Object.fromEntries(demandByDistrict),
      districtSupply: Object.fromEntries(districtSupply),
      areaSupply: Object.fromEntries(areaSupply),
    },
    points: { jobs: jobPoints, repairers: repairerPoints },
    totals: {
      // All district-level so the tiles agree with the map's granularity.
      districtsWithDemand: [...demandByDistrict.values()].filter((n) => n > 0).length,
      // Jobs sitting in a district nobody covers (the red polygons).
      uncoveredDistricts: uncoveredDistricts.length,
      uncoveredDistrictList: uncoveredDistricts,
      totalDemand: [...demand.values()].reduce((s, n) => s + n, 0),
      activeRepairers,
    },
    generatedAt: new Date().toISOString(),
  });
}

export const handler = withErrorHandler(coverageHandler);
