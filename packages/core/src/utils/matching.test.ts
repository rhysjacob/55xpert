import { describe, it, expect } from 'vitest';
import { evaluateMatch, compareByMatch, targetFromUser } from './matching';
import type { RepairerMatchTarget, JobMatchInput } from './matching';
import type { User } from '../types/user';

const baseTarget: RepairerMatchTarget = {
  organisationId: 'org-1',
  status: 'ACTIVE',
  capability: {
    vehicleSizes: ['MEDIUM'],
    repairMethods: ['REPAIR'],
    coverageAreas: ['SW'],
    basePostcode: 'SW1A 1AA',
  },
  enabledNetworks: ['wc-1'],
};

const baseJob: JobMatchInput = {
  postcode: 'SW2 3BB',
  vehicleSize: 'MEDIUM',
  repairMethods: ['REPAIR'],
};

describe('evaluateMatch', () => {
  it('matches an in-area, capable, active repairer', () => {
    const r = evaluateMatch(baseJob, baseTarget);
    expect(r.matched).toBe(true);
    expect(r.exact).toBe(true);
  });

  it('rejects a non-active org', () => {
    expect(evaluateMatch(baseJob, { ...baseTarget, status: 'SUSPENDED' }).reason).toBe('not-active');
  });

  it('scopes tenanted jobs to the company network (TRX-78)', () => {
    const job = { ...baseJob, warrantyCompanyId: 'wc-2' };
    expect(evaluateMatch(job, baseTarget).reason).toBe('not-in-network');
    const enabled = { ...baseTarget, enabledNetworks: ['wc-1', 'wc-2'] };
    expect(evaluateMatch(job, enabled).matched).toBe(true);
  });

  it('filters on vehicle size and repair method', () => {
    expect(evaluateMatch({ ...baseJob, vehicleSize: 'LARGE' }, baseTarget).reason).toBe('vehicle-size');
    expect(evaluateMatch({ ...baseJob, repairMethods: ['REPLACE'] }, baseTarget).reason).toBe('repair-method');
  });

  it('applies nearest-area fallback when not in explicit coverage (TRX-12)', () => {
    const target = { ...baseTarget, capability: { ...baseTarget.capability, coverageAreas: ['SW1'] } };
    // job SE1 is not in SW1 coverage; base SW1A vs SE1 shares "S" → proximity 0.25 < 0.5 → out
    expect(evaluateMatch({ ...baseJob, postcode: 'SE1 7PB' }, target).reason).toBe('out-of-area');
    // job SW2 not in "SW1" coverage but base SW1A vs SW2 shares "SW" → 0.5 → fallback in
    const r = evaluateMatch({ ...baseJob, postcode: 'SW2 3BB' }, target);
    expect(r.matched).toBe(true);
    expect(r.exact).toBe(false);
  });
});

describe('compareByMatch', () => {
  it('orders exact before fallback, then by proximity', () => {
    const items = [
      { exact: false, proximity: 0.9 },
      { exact: true, proximity: 0.5 },
      { exact: false, proximity: 0.6 },
    ];
    const sorted = [...items].sort(compareByMatch);
    expect(sorted[0]).toEqual({ exact: true, proximity: 0.5 });
    expect(sorted[1]).toEqual({ exact: false, proximity: 0.9 });
  });

  it('ranks by real distance when both carry it (nearer first)', () => {
    const items = [
      { exact: false, proximity: 0, distanceKm: 40 },
      { exact: false, proximity: 0, distanceKm: 5 },
      { exact: false, proximity: 0, distanceKm: 20 },
    ];
    const sorted = [...items].sort(compareByMatch);
    expect(sorted.map((x) => x.distanceKm)).toEqual([5, 20, 40]);
  });
});

describe('evaluateMatch — geo', () => {
  const geoTarget: RepairerMatchTarget = {
    ...baseTarget,
    capability: {
      vehicleSizes: ['MEDIUM'],
      repairMethods: ['REPAIR'],
      coverageAreas: ['SW'], // primary: explicit area
      basePostcode: 'SW1A 1AA',
      baseLat: 51.501,
      baseLng: -0.1416,
      coverageRadiusKm: 15,
    },
  };

  it('reports real distance on an exact-area match when geocoded', () => {
    const r = evaluateMatch({ ...baseJob, postcode: 'SW2 3BB', lat: 51.45, lng: -0.12 }, geoTarget);
    expect(r.matched).toBe(true);
    expect(r.exact).toBe(true);
    expect(r.distanceKm).toBeGreaterThan(0);
  });

  it('matches out-of-area jobs within the radius (geo fallback)', () => {
    // ~3 km away, not in "SW" coverage but inside 15 km radius.
    const r = evaluateMatch({ ...baseJob, postcode: 'SE1 7PB', lat: 51.5045, lng: -0.0865 }, geoTarget);
    expect(r.matched).toBe(true);
    expect(r.exact).toBe(false);
    expect(r.distanceKm).toBeLessThan(15);
  });

  it('rejects out-of-area jobs beyond the radius', () => {
    // Manchester — far outside 15 km.
    const r = evaluateMatch({ ...baseJob, postcode: 'M1 1AE', lat: 53.4808, lng: -2.2426 }, geoTarget);
    expect(r.reason).toBe('out-of-radius');
  });
});

describe('targetFromUser', () => {
  it('synthesises coverage from a legacy standalone repairer', () => {
    const user = {
      userId: 'u1',
      isActive: true,
      repairer: { businessName: 'Bob', isVerified: true, postcode: 'M1 1AE' },
      preferences: { vehicleSizes: ['SMALL'], repairMethods: ['REPAIR'], notifyByEmail: true },
    } as unknown as User;
    const t = targetFromUser(user);
    expect(t?.capability.coverageAreas).toEqual(['M1']);
    expect(t?.status).toBe('ACTIVE');
    expect(t?.enabledNetworks).toEqual([]);
  });

  it('is PENDING for an unverified repairer', () => {
    const user = {
      userId: 'u2',
      isActive: true,
      repairer: { businessName: 'X', isVerified: false, postcode: 'M1 1AE' },
    } as unknown as User;
    expect(targetFromUser(user)?.status).toBe('PENDING');
  });
});
