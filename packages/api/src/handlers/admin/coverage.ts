import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { TABLES } from '@corexpert/db';
import { postcodeArea, outwardCode, isRepairerMatchable } from '@corexpert/core';
import type { Job, User, RepairerOrganisation } from '@corexpert/core';
import { scanAll } from '../../lib/mi-util';

/**
 * Coverage heatmap data (TRX-30): job DEMAND vs repairer SUPPLY per UK postcode
 * area, so admin can spot under-served areas. Demand = jobs whose postcode is in
 * that area; supply = ACTIVE repairers who cover it (org capability, or a legacy
 * repairer's own postcode). An area with demand and no supply is an uncovered
 * gap. Aggregated in-memory from scans — fine at current scale.
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

  const demand = new Map<string, number>();
  const supply = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  // Map points: geocoded job locations (heat layer) + repairer bases (markers).
  const jobPoints: [number, number][] = [];
  const repairerPoints: { lat: number; lng: number; name: string; radiusKm?: number }[] = [];

  // Demand — jobs by area (+ coords for the heat layer).
  for (const j of jobs) {
    const pc = j.location?.postcode;
    if (pc) bump(demand, postcodeArea(pc));
    if (j.location?.lat != null && j.location.lng != null) jobPoints.push([j.location.lat, j.location.lng]);
  }

  // Supply — ACTIVE repairers, counted once per area they cover.
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
      baseLat = org.capability?.baseLat;
      baseLng = org.capability?.baseLng;
      radiusKm = org.capability?.coverageRadiusKm;
      name = org.name;
    } else {
      // Legacy standalone: matchable when active + verified; covers its own outcode.
      if (!(u.isActive && u.repairer?.isVerified)) continue;
      coverage = u.repairer?.postcode ? [outwardCode(u.repairer.postcode)] : [];
      baseLat = u.repairer?.lat;
      baseLng = u.repairer?.lng;
      name = u.repairer?.businessName ?? name;
    }
    activeRepairers += 1;
    const areas = new Set(coverage.map(postcodeArea).filter(Boolean));
    for (const a of areas) bump(supply, a);
    if (baseLat != null && baseLng != null) {
      repairerPoints.push({ lat: baseLat, lng: baseLng, name, ...(radiusKm != null ? { radiusKm } : {}) });
    }
  }

  const areas = [...new Set([...demand.keys(), ...supply.keys()])].map((area) => {
    const d = demand.get(area) ?? 0;
    const s = supply.get(area) ?? 0;
    return { area, demand: d, supply: s, uncovered: d > 0 && s === 0 };
  }).sort((a, b) => b.demand - a.demand || a.supply - b.supply || a.area.localeCompare(b.area));

  return ok({
    areas,
    points: { jobs: jobPoints, repairers: repairerPoints },
    totals: {
      areasWithDemand: areas.filter((a) => a.demand > 0).length,
      uncoveredAreas: areas.filter((a) => a.uncovered).length,
      totalDemand: [...demand.values()].reduce((s, n) => s + n, 0),
      activeRepairers,
    },
    generatedAt: new Date().toISOString(),
  });
}

export const handler = withErrorHandler(coverageHandler);
