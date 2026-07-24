// ---------------------------------------------------------------------------
// UK postcode helpers for job↔repairer matching.
//
// We hold NO geocoding (no lat/lng lookup service, and the lat/lng fields on
// profiles/jobs are never populated). So "distance" here is a deliberate,
// documented PREFIX proxy over the UK postcode hierarchy:
//
//   area  →  district (outward code)  →  sector  →  unit
//   "SW"  →  "SW1A"                    →  "SW1A 1" →  "SW1A 1AA"
//
// The UK inward code is always 3 chars (a digit + two letters), so the outward
// code is everything before the final 3 characters of the space-stripped code.
// Proximity is the length of the shared leading run of the outward codes: same
// district scores highest, then same area, then nothing. This orders "same
// area" above "different area" — which is all the matching fallback + ranking
// need. Limitation: adjacent districts that don't share a prefix (cross-border
// neighbours) are treated as far. Swap in real geocoding later behind the same
// functions without touching callers.
// ---------------------------------------------------------------------------

/** Uppercase and strip all whitespace: "sw1a 1aa" → "SW1A1AA". */
export function normalisePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, '');
}

/**
 * The outward code (area + district), e.g. "SW1A", "M1", "B33". Everything
 * before the final 3 chars of the normalised postcode; short/partial inputs
 * (e.g. an area-only "SW") are returned as-is.
 */
export function outwardCode(postcode: string): string {
  const n = normalisePostcode(postcode);
  return n.length <= 3 ? n : n.slice(0, n.length - 3);
}

/** The postcode area — the leading 1–2 letters, e.g. "SW", "M", "EH". */
export function postcodeArea(postcode: string): string {
  const n = normalisePostcode(postcode);
  const m = n.match(/^[A-Z]{1,2}/);
  return m ? m[0] : n;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in km between two coordinates (haversine). Used for
 * real distance-based coverage + ranking once postcodes are geocoded; the
 * prefix helpers below remain the fallback when coordinates are absent.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the shared leading characters of two strings. */
function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Coarse proximity of two postcodes in [0, 1] with NO geocoding. Same outward
 * code → 1; otherwise the fraction of the outward code they share (so same
 * area+digit ranks above same area, which ranks above nothing). Use for the
 * distance ranking (TRX-13) and nearest-area fallback (TRX-12), not for exact
 * distances.
 */
export function postcodeProximity(a: string, b: string): number {
  const oa = outwardCode(a);
  const ob = outwardCode(b);
  if (oa === ob) return 1;
  const shared = commonPrefixLength(oa, ob);
  const maxLen = Math.max(oa.length, ob.length);
  return maxLen === 0 ? 0 : shared / maxLen;
}

/**
 * Whether a postcode falls within any of the given coverage prefixes. A
 * coverage prefix is a normalised area/district ("SW", "SE1", "M") — a job
 * matches when its postcode starts with the prefix. Empty prefixes never match
 * (an empty string would otherwise match everything).
 *
 * Note: this is a blunt `startsWith`, so a single-letter AREA like "M" also
 * matches "ME"/"MK". For coverage matching prefer {@link postcodeCoveredBy},
 * which is boundary-aware (area entries match by area, districts by outcode).
 */
export function postcodeMatchesAny(postcode: string, coveragePrefixes: string[]): boolean {
  const n = normalisePostcode(postcode);
  return coveragePrefixes.some((p) => {
    const prefix = normalisePostcode(p);
    return prefix.length > 0 && n.startsWith(prefix);
  });
}

/** A coverage entry is an AREA if it's just letters (e.g. "SW", "M"), else a
 *  district / outward code (e.g. "SW1A", "SK6", "M1"). */
function isAreaEntry(entry: string): boolean {
  return /^[A-Z]{1,2}$/.test(entry);
}

/**
 * Whether a job postcode is covered by any coverage entry, boundary-aware:
 * an AREA entry ("SK") matches a job in that area (SK1, SK6, …) but NOT other
 * areas that merely share the letter ("SKx" only, never "SE"/"ST"); a DISTRICT
 * entry ("SK6", "SW1A") matches only that exact outward code. This is the
 * district-first coverage test used by the matcher.
 */
export function postcodeCoveredBy(postcode: string, coverageEntries: string[]): boolean {
  const outward = outwardCode(postcode);
  const area = postcodeArea(postcode);
  return coverageEntries.some((raw) => {
    const e = normalisePostcode(raw);
    if (!e) return false;
    return isAreaEntry(e) ? area === e : outward === e;
  });
}

/**
 * Whether two postcodes share the same leading `chars` characters (default 3).
 * The literal "first 3 chars" rule from TRX-11 — a blunter test than
 * {@link postcodeMatchesAny}, kept for callers that want it explicitly.
 */
export function sharePostcodePrefix(a: string, b: string, chars = 3): boolean {
  const na = normalisePostcode(a);
  const nb = normalisePostcode(b);
  if (na.length === 0 || nb.length === 0) return false;
  return na.slice(0, chars) === nb.slice(0, chars);
}
