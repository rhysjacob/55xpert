import {
  FraudReasonCode,
  FraudBand,
  type FraudReason,
  type FraudAssessment,
  type ImageExif,
} from '../types/fraud';
import type { ImageType } from '../types/triage';

// ---------------------------------------------------------------------------
// Pure fraud scoring. No I/O. Given already-extracted signals, produce a
// weighted risk score and band. See docs/fraud-detection-spec.md.
//
// Read discipline that the callers MUST honour and this module encodes:
//  - MISSING EXIF is common and innocent (apps strip it) -> `notRun`, never a
//    score.
//  - CORRECT EXIF is weak positive evidence (forgeable in seconds) -> we never
//    LOWER risk for good-looking metadata. Only INCONSISTENCY scores.
// Weights are deliberately tunable and start as estimates; calibrate against
// real cases (they belong behind SSM config once volume exists).
// ---------------------------------------------------------------------------

/** Starting weights per signal. Tune after observing real cases. */
export const FRAUD_WEIGHTS: Record<FraudReasonCode, number> = {
  PHOTO_PREDATES_INCIDENT: 35,
  PHOTO_LONG_AFTER_INCIDENT: 15,
  PHOTO_AFTER_CASE_CREATED: 20,
  PHOTOS_TIME_SCATTERED: 20,
  GPS_FAR_FROM_POSTCODE: 15,
  EDIT_SOFTWARE_TAG: 30,
  MIXED_CAMERAS: 15,
  EXACT_DUPLICATE: 40,
  NEAR_DUPLICATE: 35,
  INTERNAL_DUPLICATE: 10,
  KNOWN_STOCK_IMAGE: 30,
  THUMBNAIL_MISMATCH: 30,
  DOUBLE_COMPRESSION: 20,
  C2PA_PRESENT: -10, // provenance present -> slightly reassuring
  SYNTHID_OR_AI_TAG: 40,
  VEHICLE_MISMATCH: 35,
  CROSS_PHOTO_INCONSISTENT: 25,
  SCREEN_REPHOTOGRAPH: 25,
  SCENE_TIME_MISMATCH: 20,
};

/** Score >= HIGH_BAND_MIN -> HIGH; >= MEDIUM_BAND_MIN -> MEDIUM; else LOW. */
export const MEDIUM_BAND_MIN = 30;
export const HIGH_BAND_MIN = 60;

/** How far a photo may sit after the incident before it looks suspicious. */
export const LONG_AFTER_INCIDENT_DAYS = 14;
/** Max spread between one session's photos before it looks staged. */
export const TIME_SCATTER_HOURS = 24;
/** Max plausible distance between EXIF GPS and the stated postcode. */
export const GPS_MAX_KM = 50;
/** Editing software substrings that flag a deliberate edit. */
const EDIT_SOFTWARE = ['photoshop', 'gimp', 'lightroom', 'affinity', 'pixelmator', 'snapseed'];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface FraudScoreImage {
  imageType: ImageType;
  exif?: ImageExif;
}

export interface FraudScoreInput {
  /** Stated incident date (ISO), if the consumer gave one. */
  incidentDate?: string;
  /** When the case row was created (ISO). */
  caseCreatedAt: string;
  /** Centroid of the stated postcode, if resolvable. */
  postcodeLatLng?: { lat: number; lng: number };
  images: FraudScoreImage[];
  /**
   * Signals produced outside this module (duplicate lookups, vision-model
   * fraud screen, tamper checks) that we fold into the same score.
   */
  externalReasons?: FraudReason[];
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function band(score: number): FraudBand {
  if (score >= HIGH_BAND_MIN) return FraudBand.HIGH;
  if (score >= MEDIUM_BAND_MIN) return FraudBand.MEDIUM;
  return FraudBand.LOW;
}

/**
 * Compute a fraud assessment from extracted per-image signals plus any
 * externally-produced reasons. Pure and deterministic.
 */
export function scoreFraud(input: FraudScoreInput): FraudAssessment {
  const reasons: FraudReason[] = [];
  const notRun = new Set<FraudReasonCode>();
  const add = (code: FraudReasonCode, detail: string, imageType?: ImageType) => {
    reasons.push(
      imageType
        ? { code, detail, weight: FRAUD_WEIGHTS[code], imageType }
        : { code, detail, weight: FRAUD_WEIGHTS[code] },
    );
  };

  const incidentMs = input.incidentDate ? Date.parse(input.incidentDate) : NaN;
  const caseCreatedMs = Date.parse(input.caseCreatedAt);

  // Collect capture times as we go for the cross-photo scatter check.
  const captureTimes: number[] = [];
  const cameraModels = new Set<string>();
  let anyExif = false;

  for (const img of input.images) {
    const exif = img.exif;
    if (!exif || exif.stripped) continue;
    anyExif = true;

    // --- capture-time rules ---
    if (exif.dateTimeOriginal) {
      const captureMs = Date.parse(exif.dateTimeOriginal);
      if (Number.isFinite(captureMs)) {
        captureTimes.push(captureMs);

        if (Number.isFinite(incidentMs)) {
          if (captureMs < incidentMs - DAY_MS) {
            add(
              FraudReasonCode.PHOTO_PREDATES_INCIDENT,
              `Photo taken ${fmtDaysBefore(incidentMs, captureMs)} before the stated incident date.`,
              img.imageType,
            );
          } else if (captureMs > incidentMs + LONG_AFTER_INCIDENT_DAYS * DAY_MS) {
            add(
              FraudReasonCode.PHOTO_LONG_AFTER_INCIDENT,
              `Photo taken ${Math.round((captureMs - incidentMs) / DAY_MS)} days after the stated incident date.`,
              img.imageType,
            );
          }
        }
        // A genuine prior-incident photo cannot have been captured after the
        // case was opened.
        if (Number.isFinite(caseCreatedMs) && captureMs > caseCreatedMs + HOUR_MS) {
          add(
            FraudReasonCode.PHOTO_AFTER_CASE_CREATED,
            'Photo capture time is after the case was created.',
            img.imageType,
          );
        }
      }
    }

    // --- provenance rules ---
    if (exif.software && EDIT_SOFTWARE.some((s) => exif.software!.toLowerCase().includes(s))) {
      add(
        FraudReasonCode.EDIT_SOFTWARE_TAG,
        `Image metadata names editing software: "${exif.software}".`,
        img.imageType,
      );
    }
    if (exif.cameraModel) cameraModels.add(exif.cameraModel);

    // --- GPS rule ---
    if (exif.gps && input.postcodeLatLng) {
      const km = haversineKm(exif.gps, input.postcodeLatLng);
      if (km > GPS_MAX_KM) {
        add(
          FraudReasonCode.GPS_FAR_FROM_POSTCODE,
          `Photo GPS is ~${Math.round(km)}km from the stated postcode.`,
          img.imageType,
        );
      }
    } else if (input.postcodeLatLng) {
      notRun.add(FraudReasonCode.GPS_FAR_FROM_POSTCODE);
    }
  }

  // --- cross-photo rules ---
  if (captureTimes.length >= 2) {
    const spread = Math.max(...captureTimes) - Math.min(...captureTimes);
    if (spread > TIME_SCATTER_HOURS * HOUR_MS) {
      add(
        FraudReasonCode.PHOTOS_TIME_SCATTERED,
        `Photos span ${Math.round(spread / HOUR_MS)}h — a single incident's photos are normally minutes apart.`,
      );
    }
  }
  if (cameraModels.size > 1) {
    add(
      FraudReasonCode.MIXED_CAMERAS,
      `Photos come from ${cameraModels.size} different cameras (${[...cameraModels].join(', ')}).`,
    );
  }

  // If no image carried usable EXIF, the timing/provenance/GPS family simply
  // couldn't run. Innocent — record it, don't score it.
  if (!anyExif) {
    notRun.add(FraudReasonCode.PHOTO_PREDATES_INCIDENT);
    notRun.add(FraudReasonCode.PHOTO_AFTER_CASE_CREATED);
    notRun.add(FraudReasonCode.PHOTOS_TIME_SCATTERED);
    notRun.add(FraudReasonCode.GPS_FAR_FROM_POSTCODE);
    notRun.add(FraudReasonCode.EDIT_SOFTWARE_TAG);
  }

  // Fold in externally-produced reasons (duplicates, vision screen, tamper).
  for (const r of input.externalReasons ?? []) reasons.push(r);

  const rawScore = reasons.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    band: band(score),
    reasons,
    notRun: [...notRun],
  };
}

function fmtDaysBefore(incidentMs: number, captureMs: number): string {
  const days = Math.round((incidentMs - captureMs) / DAY_MS);
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : 'less than a day';
}
