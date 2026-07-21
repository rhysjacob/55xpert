import { describe, it, expect } from 'vitest';
import { getScheme, SCHEMES } from '@corexpert/core';
import { parseCompanyScheme, warrantyCompanySchemeSchema } from './warranty-scheme-schema';

/** A real, valid ruleset drawn from the hardcoded seed template. */
function seedScheme() {
  const s = getScheme('company-2025');
  return { eligibility: s.eligibility, matrix: s.matrix };
}

describe('warrantyCompanySchemeSchema', () => {
  it('accepts every hardcoded seed scheme', () => {
    for (const s of Object.values(SCHEMES)) {
      expect(() => parseCompanyScheme({ eligibility: s.eligibility, matrix: s.matrix })).not.toThrow();
    }
  });

  it('rejects a missing eligibility field', () => {
    const bad = seedScheme();
    delete (bad.eligibility as unknown as Record<string, unknown>)['maxDamageCm'];
    expect(warrantyCompanySchemeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a VAT rate outside 0–1', () => {
    const bad = seedScheme();
    bad.matrix = { ...bad.matrix, vatRate: 20 };
    expect(warrantyCompanySchemeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-integer matrix price', () => {
    const bad = seedScheme();
    bad.matrix = { ...bad.matrix, mirrorCoverPrice: 197.5 };
    expect(warrantyCompanySchemeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(warrantyCompanySchemeSchema.safeParse({}).success).toBe(false);
  });
});
