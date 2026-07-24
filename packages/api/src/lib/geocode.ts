import { logger } from './logger';
import type { LatLng, RepairerCapability } from '@corexpert/core';
import { normalisePostcode } from '@corexpert/core';

// ---------------------------------------------------------------------------
// UK postcode → lat/lng via postcodes.io (free, keyless, UK-only, open-source).
// Every call is BEST-EFFORT: an invalid postcode, a non-200, or a network error
// returns null (or is skipped in bulk) — a geocode failure must never break
// sign-up, case creation, or a coverage edit. Matching degrades gracefully to
// the postcode-prefix proxy when coordinates are absent. Lambdas have default
// internet egress (no VPC), so no infra is required.
// ---------------------------------------------------------------------------

const BASE = process.env['POSTCODES_IO_BASE'] ?? 'https://api.postcodes.io';
const TIMEOUT_MS = 4000;

// Per-container cache so repeated postcodes (e.g. a backfill or a busy area)
// aren't re-fetched. `null` is cached too — a known-bad postcode stays bad.
const cache = new Map<string, LatLng | null>();

interface PostcodeResult {
  latitude?: number | null;
  longitude?: number | null;
}

function toLatLng(r: PostcodeResult | null | undefined): LatLng | null {
  const lat = r?.latitude;
  const lng = r?.longitude;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    logger.warn('postcodes.io request failed', { url, err: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Geocode a single UK postcode. Returns null on any failure (invalid postcode,
 * network, timeout). Cached per Lambda container.
 */
export async function geocodePostcode(postcode: string): Promise<LatLng | null> {
  const key = normalisePostcode(postcode);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const body = (await fetchJson(`${BASE}/postcodes/${encodeURIComponent(key)}`)) as
    | { result?: PostcodeResult }
    | null;
  const coords = toLatLng(body?.result);
  cache.set(key, coords);
  return coords;
}

/**
 * Populate a capability's base coordinates from its basePostcode (best-effort).
 * Returns the capability unchanged when there's no postcode or geocoding fails —
 * so a save never depends on the geocoder.
 */
export async function geocodeCapabilityBase(cap: RepairerCapability): Promise<RepairerCapability> {
  if (!cap.basePostcode) return cap;
  const coords = await geocodePostcode(cap.basePostcode);
  return coords ? { ...cap, baseLat: coords.lat, baseLng: coords.lng } : cap;
}

/**
 * Bulk-geocode postcodes (backfill). Chunks into the 100-per-request limit and
 * returns a map of normalised postcode → coords for those that resolved; failed
 * or unknown postcodes are simply omitted.
 */
export async function geocodePostcodesBulk(postcodes: string[]): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>();
  const unique = [...new Set(postcodes.map(normalisePostcode).filter(Boolean))];

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const body = (await fetchJson(`${BASE}/postcodes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk }),
    })) as { result?: Array<{ query: string; result: PostcodeResult | null }> } | null;

    for (const row of body?.result ?? []) {
      const coords = toLatLng(row.result);
      if (coords) {
        out.set(normalisePostcode(row.query), coords);
        cache.set(normalisePostcode(row.query), coords);
      }
    }
  }
  return out;
}
