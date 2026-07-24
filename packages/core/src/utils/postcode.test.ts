import { describe, it, expect } from 'vitest';
import {
  normalisePostcode,
  outwardCode,
  postcodeArea,
  postcodeProximity,
  postcodeMatchesAny,
  sharePostcodePrefix,
} from './postcode';

describe('normalisePostcode', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalisePostcode('sw1a 1aa')).toBe('SW1A1AA');
    expect(normalisePostcode('  m1  1ae ')).toBe('M11AE');
  });
});

describe('outwardCode', () => {
  it('drops the 3-char inward code', () => {
    expect(outwardCode('SW1A 1AA')).toBe('SW1A');
    expect(outwardCode('M1 1AE')).toBe('M1');
    expect(outwardCode('B33 8TH')).toBe('B33');
  });
  it('returns short/partial inputs as-is', () => {
    expect(outwardCode('SW')).toBe('SW');
    expect(outwardCode('M1')).toBe('M1');
  });
});

describe('postcodeArea', () => {
  it('extracts the leading letters', () => {
    expect(postcodeArea('SW1A 1AA')).toBe('SW');
    expect(postcodeArea('M1 1AE')).toBe('M');
    expect(postcodeArea('EH12 5AB')).toBe('EH');
  });
});

describe('postcodeProximity', () => {
  it('is 1 for the same outward code', () => {
    expect(postcodeProximity('SW1A 1AA', 'SW1A 9ZZ')).toBe(1);
  });
  it('ranks same-area above different-area', () => {
    const sameArea = postcodeProximity('SW1A 1AA', 'SW2 3BB'); // share "SW"
    const diffArea = postcodeProximity('SW1A 1AA', 'M1 1AE'); // share nothing
    expect(sameArea).toBeGreaterThan(diffArea);
    expect(diffArea).toBe(0);
  });
  it('ranks same area+digit above same area only', () => {
    const areaDigit = postcodeProximity('SW1 1AA', 'SW1 2BB');
    const areaOnly = postcodeProximity('SW1 1AA', 'SW9 2BB');
    expect(areaDigit).toBeGreaterThan(areaOnly);
  });
});

describe('postcodeMatchesAny', () => {
  it('matches when the postcode starts with a coverage prefix', () => {
    expect(postcodeMatchesAny('SW1A 1AA', ['SW', 'M'])).toBe(true);
    expect(postcodeMatchesAny('m1 1ae', ['SW', 'M1'])).toBe(true);
  });
  it('does not match outside the prefixes', () => {
    expect(postcodeMatchesAny('B33 8TH', ['SW', 'M'])).toBe(false);
  });
  it('ignores empty prefixes (never matches everything)', () => {
    expect(postcodeMatchesAny('B33 8TH', ['', '  '])).toBe(false);
  });
});

describe('sharePostcodePrefix', () => {
  it('compares the first 3 chars by default (TRX-11)', () => {
    expect(sharePostcodePrefix('SW1A 1AA', 'SW1 9ZZ')).toBe(true); // "SW1"
    expect(sharePostcodePrefix('SW1A 1AA', 'SW2 3BB')).toBe(false); // "SW1" vs "SW2"
  });
  it('is false for empty inputs', () => {
    expect(sharePostcodePrefix('', 'SW1A 1AA')).toBe(false);
  });
});
