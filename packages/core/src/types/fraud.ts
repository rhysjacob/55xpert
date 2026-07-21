import type { ImageType } from './triage';

/**
 * Fraud-risk signals. Each is independently weak and defeatable; the score is a
 * weighted sum meant to route a case to human (Xpert) review, never to auto-
 * reject. See docs/fraud-detection-spec.md.
 */
export const FraudReasonCode = {
  // Tier A — timing & provenance (EXIF)
  PHOTO_PREDATES_INCIDENT: 'PHOTO_PREDATES_INCIDENT',
  PHOTO_LONG_AFTER_INCIDENT: 'PHOTO_LONG_AFTER_INCIDENT',
  PHOTO_AFTER_CASE_CREATED: 'PHOTO_AFTER_CASE_CREATED',
  PHOTOS_TIME_SCATTERED: 'PHOTOS_TIME_SCATTERED',
  GPS_FAR_FROM_POSTCODE: 'GPS_FAR_FROM_POSTCODE',
  EDIT_SOFTWARE_TAG: 'EDIT_SOFTWARE_TAG',
  MIXED_CAMERAS: 'MIXED_CAMERAS',
  // Tier B — duplicate / reuse
  EXACT_DUPLICATE: 'EXACT_DUPLICATE',
  NEAR_DUPLICATE: 'NEAR_DUPLICATE',
  INTERNAL_DUPLICATE: 'INTERNAL_DUPLICATE',
  KNOWN_STOCK_IMAGE: 'KNOWN_STOCK_IMAGE',
  // Tier C — tamper / synthetic
  THUMBNAIL_MISMATCH: 'THUMBNAIL_MISMATCH',
  DOUBLE_COMPRESSION: 'DOUBLE_COMPRESSION',
  C2PA_PRESENT: 'C2PA_PRESENT',
  SYNTHID_OR_AI_TAG: 'SYNTHID_OR_AI_TAG',
  // Tier D — semantic (vision model)
  VEHICLE_MISMATCH: 'VEHICLE_MISMATCH',
  CROSS_PHOTO_INCONSISTENT: 'CROSS_PHOTO_INCONSISTENT',
  SCREEN_REPHOTOGRAPH: 'SCREEN_REPHOTOGRAPH',
  SCENE_TIME_MISMATCH: 'SCENE_TIME_MISMATCH',
} as const;
export type FraudReasonCode = (typeof FraudReasonCode)[keyof typeof FraudReasonCode];

export const FraudBand = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type FraudBand = (typeof FraudBand)[keyof typeof FraudBand];

/** A single fired fraud signal and its contribution to the score. */
export interface FraudReason {
  code: FraudReasonCode;
  /** Human sentence shown to the Xpert. */
  detail: string;
  /** Points this reason contributed to the score. */
  weight: number;
  /** Which image triggered it, when applicable. */
  imageType?: ImageType;
}

/**
 * The fraud verdict attached to a triage result. A non-LOW band badges the case
 * and forces Xpert referral (see triage worker), but never blocks or rejects.
 */
export interface FraudAssessment {
  /** 0–100, capped sum of fired weights. */
  score: number;
  band: FraudBand;
  reasons: FraudReason[];
  /** Signals that couldn't run (e.g. no EXIF, no GPS) — shown for transparency. */
  notRun: FraudReasonCode[];
}

/** Per-image forensic data extracted at triage time. All fields best-effort. */
export interface ImageExif {
  /** Original capture time (ISO) from EXIF DateTimeOriginal, if present. */
  dateTimeOriginal?: string;
  gps?: { lat: number; lng: number };
  cameraMake?: string;
  cameraModel?: string;
  /** Editing-software tag, e.g. "Adobe Photoshop 25.0" — an edit signal. */
  software?: string;
  /** Perceptual hash of the embedded EXIF thumbnail; mismatch vs main = tamper. */
  thumbnailPHash?: string;
  /** True when the file carried no usable EXIF at all (common and innocent). */
  stripped?: boolean;
}

export interface ImageForensics {
  /** Perceptual hash (hex) of the full image, for duplicate detection. */
  pHash?: string;
  /** SHA-256 of the raw bytes — exact-duplicate + integrity. */
  sha256?: string;
  exif?: ImageExif;
  /** OCR'd registration, for the plate cross-check (REGISTRATION_PLATE only). */
  plateReadout?: string;
}
