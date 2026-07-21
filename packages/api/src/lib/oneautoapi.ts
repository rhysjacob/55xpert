import { getSecret } from './secrets';
import type { Vehicle, VehicleProvenance, VehicleSize } from '@corexpert/core';

/**
 * Thin client for OneAutoAPI (https://www.oneautoapi.com).
 *
 * We deliberately do NOT use their generated `typescript-node` SDK (deprecated
 * `request` dependency, CJS, and it doesn't even compile — see
 * vendor/oneautoapi-sdk/README.md). This calls the same endpoints with native
 * fetch. The API key lives in Secrets Manager and is fetched at runtime; the
 * value never appears in code or environment.
 */

const BASE_URL = process.env['ONEAUTO_BASE_URL'] ?? 'https://sandbox.oneautoapi.com';
const SECRET_NAME = process.env['VEHICLE_LOOKUP_SECRET_NAME'] ?? '';
const TIMEOUT_MS = 10_000;

async function oneAutoGet<T>(path: string, query: Record<string, string | number | undefined>): Promise<T> {
  if (!SECRET_NAME) {
    throw new Error('VEHICLE_LOOKUP_SECRET_NAME is not configured');
  }
  const apiKey = await getSecret(SECRET_NAME);

  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OneAutoAPI ${path} returned HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Experian AutoCheck — GET /experian/autocheck/v3
// Response subset we consume (snake_case as returned by the API).
// ---------------------------------------------------------------------------

interface ExperianAutocheckResult {
  vehicle_registration_mark?: string;
  vehicle_identification_number?: string;
  dvla_manufacturer_desc?: string;
  dvla_model_desc?: string;
  dvla_body_desc?: string;
  manufactured_year?: number;
  colour?: string;
  is_scrapped?: boolean;
  is_imported?: boolean;
  is_exported?: boolean;
  was_exported?: boolean;
  colour_changes_qty?: number;
  cherished_data_qty?: number;
  finance_data_qty?: number;
  condition_data_qty?: number;
  stolen_vehicle_data_qty?: number;
}

interface ExperianAutocheckResponse {
  success?: boolean;
  result?: ExperianAutocheckResult;
  error?: string;
}

export interface VehicleLookup {
  vehicle: Vehicle;
  provenance: VehicleProvenance;
}

/** Look up a vehicle by registration mark (VRM). Returns null when not found. */
export async function lookupVehicleByVrm(vrm: string): Promise<VehicleLookup | null> {
  const res = await oneAutoGet<ExperianAutocheckResponse>('/experian/autocheck/v3', {
    vehicle_registration_mark: vrm,
  });
  return toVehicleLookup(res);
}

/** Look up a vehicle by VIN. Returns null when not found. */
export async function lookupVehicleByVin(vin: string): Promise<VehicleLookup | null> {
  const res = await oneAutoGet<ExperianAutocheckResponse>('/experian/autocheck/v3', {
    vehicle_identification_number: vin,
  });
  return toVehicleLookup(res);
}

function toVehicleLookup(res: ExperianAutocheckResponse): VehicleLookup | null {
  const r = res.result;
  // Treat an explicit failure or an empty/identity-less result as "not found".
  if (res.success === false || !r || (!r.dvla_manufacturer_desc && !r.vehicle_registration_mark)) {
    return null;
  }

  const provenance: VehicleProvenance = {
    isStolen: (r.stolen_vehicle_data_qty ?? 0) > 0,
    isScrapped: r.is_scrapped ?? false,
    isWrittenOff: (r.condition_data_qty ?? 0) > 0,
    hasOutstandingFinance: (r.finance_data_qty ?? 0) > 0,
    isImported: r.is_imported ?? false,
    isExported: (r.is_exported ?? false) || (r.was_exported ?? false),
    colourChanged: (r.colour_changes_qty ?? 0) > 0,
    plateChanged: (r.cherished_data_qty ?? 0) > 0,
  };

  const vehicle: Vehicle = {
    provenance,
    ...(r.vehicle_registration_mark ? { registrationNo: r.vehicle_registration_mark } : {}),
    ...(r.dvla_manufacturer_desc ? { make: r.dvla_manufacturer_desc } : {}),
    ...(r.dvla_model_desc ? { model: r.dvla_model_desc } : {}),
    ...(r.manufactured_year ? { year: r.manufactured_year } : {}),
    ...(r.colour ? { colour: r.colour } : {}),
    ...(r.dvla_body_desc ? { vehicleSize: inferVehicleSize(r.dvla_body_desc) } : {}),
  };

  return { vehicle, provenance };
}

/**
 * Rough map from DVLA body description → our VehicleSize buckets.
 * ASSUMPTION: defaults to MEDIUM when the body type is unrecognised. Tune the
 * keyword matching against real AutoCheck responses.
 */
function inferVehicleSize(bodyDesc: string): VehicleSize {
  const b = bodyDesc.toUpperCase();
  if (b.includes('VAN') || b.includes('PANEL') || b.includes('LUTON')) return 'VAN';
  if (b.includes('SUV') || b.includes('SPORTS UTILITY') || b.includes('4X4')) return 'SUV';
  if (b.includes('ESTATE') || b.includes('MPV') || b.includes('MINIBUS') || b.includes('TOURER')) return 'LARGE';
  return 'MEDIUM';
}

// ---------------------------------------------------------------------------
// Vehicle Imagery — GET /vehicleimagery/imagesearch/
// Client-only for now (no route/UI). NOTE: the imagery taxonomy (manufacturer_desc/
// model_range_desc/derivative_desc) differs from DVLA descriptions returned by
// AutoCheck, so chaining a reg lookup into this is best-effort.
// ---------------------------------------------------------------------------

/** Per-angle image IDs; resolve each via GET /vehicleimagery/imagefromid/. */
export interface VehicleImageIds {
  front?: string;
  front_right?: string;
  right?: string;
  rear_right?: string;
  rear?: string;
  rear_left?: string;
  left?: string;
  front_left?: string;
  inside_1?: string;
  inside_2?: string;
  inside_3?: string;
}

export interface VehicleImageMatch {
  manufacturer_desc?: string;
  model_range_desc?: string;
  body_type_desc?: string;
  derivative_desc?: string;
  manufactured_year?: number;
  image_ids?: VehicleImageIds;
  colour_desc_list?: string[];
}

interface VehicleImageSearchResponse {
  success?: boolean;
  result?: VehicleImageMatch[];
}

export interface VehicleImageSearchParams {
  manufacturerDesc: string;
  modelRangeDesc: string;
  manufacturedYear: number;
  derivativeDesc?: string;
  bodyTypeDesc?: string;
}

/** Search stock vehicle imagery. Returns [] when nothing matches. */
export async function searchVehicleImages(params: VehicleImageSearchParams): Promise<VehicleImageMatch[]> {
  const res = await oneAutoGet<VehicleImageSearchResponse>('/vehicleimagery/imagesearch/', {
    manufacturer_desc: params.manufacturerDesc,
    model_range_desc: params.modelRangeDesc,
    manufactured_year: params.manufacturedYear,
    derivative_desc: params.derivativeDesc,
    body_type_desc: params.bodyTypeDesc,
  });
  return res.result ?? [];
}
