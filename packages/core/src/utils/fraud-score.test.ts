import { describe, it, expect } from 'vitest';
import { scoreFraud, FRAUD_WEIGHTS, MEDIUM_BAND_MIN, HIGH_BAND_MIN } from './fraud-score';
import { FraudReasonCode, FraudBand, type FraudReason } from '../types/fraud';

const CASE_CREATED = '2026-07-01T12:00:00.000Z';
const INCIDENT = '2026-06-30T09:00:00.000Z';

/** A clean case: EXIF present, consistent, no red flags. */
function cleanImages() {
  return [
    {
      imageType: 'DAMAGE_ANGLE_1' as const,
      exif: {
        dateTimeOriginal: '2026-06-30T09:05:00.000Z',
        cameraModel: 'iPhone 15',
        gps: { lat: 53.4, lng: -2.1 },
      },
    },
    {
      imageType: 'DAMAGE_ANGLE_2' as const,
      exif: {
        dateTimeOriginal: '2026-06-30T09:06:00.000Z',
        cameraModel: 'iPhone 15',
        gps: { lat: 53.4, lng: -2.1 },
      },
    },
  ];
}

describe('scoreFraud — read discipline', () => {
  it('scores a clean, EXIF-consistent case as LOW with no reasons', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      postcodeLatLng: { lat: 53.41, lng: -2.11 },
      images: cleanImages(),
    });
    expect(r.reasons).toHaveLength(0);
    expect(r.score).toBe(0);
    expect(r.band).toBe(FraudBand.LOW);
  });

  it('treats missing EXIF as notRun, never as a score', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      postcodeLatLng: { lat: 53.41, lng: -2.11 },
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { stripped: true } },
        { imageType: 'DAMAGE_ANGLE_2' }, // no exif at all
      ],
    });
    expect(r.reasons).toHaveLength(0);
    expect(r.band).toBe(FraudBand.LOW);
    expect(r.notRun).toContain(FraudReasonCode.PHOTO_PREDATES_INCIDENT);
    expect(r.notRun).toContain(FraudReasonCode.GPS_FAR_FROM_POSTCODE);
  });

  it('does not reward correct-looking EXIF with a negative score', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: cleanImages(),
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe('scoreFraud — timing signals', () => {
  it('flags a photo predating the incident', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: [
        {
          imageType: 'DAMAGE_ANGLE_1',
          exif: { dateTimeOriginal: '2026-05-01T09:00:00.000Z', cameraModel: 'iPhone 15' },
        },
      ],
    });
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain(FraudReasonCode.PHOTO_PREDATES_INCIDENT);
    expect(r.score).toBe(FRAUD_WEIGHTS.PHOTO_PREDATES_INCIDENT);
  });

  it('flags a photo captured after the case was created', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: [
        {
          imageType: 'DAMAGE_ANGLE_1',
          exif: { dateTimeOriginal: '2026-07-02T09:00:00.000Z', cameraModel: 'iPhone 15' },
        },
      ],
    });
    expect(r.reasons.map((x) => x.code)).toContain(FraudReasonCode.PHOTO_AFTER_CASE_CREATED);
  });

  it('does not flag a photo within a day of the incident', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: [
        {
          imageType: 'DAMAGE_ANGLE_1',
          exif: { dateTimeOriginal: '2026-06-30T20:00:00.000Z', cameraModel: 'iPhone 15' },
        },
      ],
    });
    expect(r.reasons).toHaveLength(0);
  });

  it('flags photos scattered over more than a day', () => {
    const r = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { dateTimeOriginal: '2026-06-30T09:00:00.000Z', cameraModel: 'iPhone 15' } },
        { imageType: 'DAMAGE_ANGLE_2', exif: { dateTimeOriginal: '2026-06-28T09:00:00.000Z', cameraModel: 'iPhone 15' } },
      ],
    });
    expect(r.reasons.map((x) => x.code)).toContain(FraudReasonCode.PHOTOS_TIME_SCATTERED);
  });
});

describe('scoreFraud — provenance & GPS', () => {
  it('flags editing-software tags', () => {
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { software: 'Adobe Photoshop 25.0', cameraModel: 'iPhone 15' } },
      ],
    });
    expect(r.reasons.map((x) => x.code)).toContain(FraudReasonCode.EDIT_SOFTWARE_TAG);
  });

  it('flags mixed cameras across one session', () => {
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { cameraModel: 'iPhone 15' } },
        { imageType: 'DAMAGE_ANGLE_2', exif: { cameraModel: 'Pixel 8' } },
      ],
    });
    expect(r.reasons.map((x) => x.code)).toContain(FraudReasonCode.MIXED_CAMERAS);
  });

  it('flags GPS far from the stated postcode', () => {
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      postcodeLatLng: { lat: 53.4, lng: -2.1 }, // Manchester
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { gps: { lat: 51.5, lng: -0.12 }, cameraModel: 'iPhone 15' } }, // London
      ],
    });
    expect(r.reasons.map((x) => x.code)).toContain(FraudReasonCode.GPS_FAR_FROM_POSTCODE);
  });

  it('does not flag GPS within tolerance', () => {
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      postcodeLatLng: { lat: 53.4, lng: -2.1 },
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { gps: { lat: 53.42, lng: -2.13 }, cameraModel: 'iPhone 15' } },
      ],
    });
    expect(r.reasons.map((x) => x.code)).not.toContain(FraudReasonCode.GPS_FAR_FROM_POSTCODE);
  });
});

describe('scoreFraud — banding, external reasons & capping', () => {
  it('promotes to MEDIUM/HIGH by score thresholds', () => {
    const medium = scoreFraud({
      incidentDate: INCIDENT,
      caseCreatedAt: CASE_CREATED,
      images: [
        { imageType: 'DAMAGE_ANGLE_1', exif: { dateTimeOriginal: '2026-05-01T09:00:00.000Z', cameraModel: 'iPhone 15' } },
      ],
    });
    expect(medium.score).toBeGreaterThanOrEqual(MEDIUM_BAND_MIN);
    expect(medium.band).toBe(FraudBand.MEDIUM);
  });

  it('folds external reasons into the score and bands HIGH', () => {
    const external: FraudReason[] = [
      { code: FraudReasonCode.EXACT_DUPLICATE, detail: 'Seen on case X', weight: FRAUD_WEIGHTS.EXACT_DUPLICATE },
      { code: FraudReasonCode.VEHICLE_MISMATCH, detail: 'Plate says BMW, registered Nissan', weight: FRAUD_WEIGHTS.VEHICLE_MISMATCH },
    ];
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      images: cleanImages(),
      externalReasons: external,
    });
    expect(r.score).toBeGreaterThanOrEqual(HIGH_BAND_MIN);
    expect(r.band).toBe(FraudBand.HIGH);
  });

  it('caps the score at 100', () => {
    const many: FraudReason[] = Array.from({ length: 6 }, () => ({
      code: FraudReasonCode.EXACT_DUPLICATE,
      detail: 'dup',
      weight: FRAUD_WEIGHTS.EXACT_DUPLICATE,
    }));
    const r = scoreFraud({ caseCreatedAt: CASE_CREATED, images: [], externalReasons: many });
    expect(r.score).toBe(100);
  });

  it('never returns a negative score even with a reassuring signal', () => {
    const r = scoreFraud({
      caseCreatedAt: CASE_CREATED,
      images: cleanImages(),
      externalReasons: [
        { code: FraudReasonCode.C2PA_PRESENT, detail: 'Valid manifest', weight: FRAUD_WEIGHTS.C2PA_PRESENT },
      ],
    });
    expect(r.score).toBe(0);
    expect(r.band).toBe(FraudBand.LOW);
  });
});
