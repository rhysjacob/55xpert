import { describe, it, expect } from 'vitest';
import { validateIngestJob } from './ingest-validation';
import type { IngestJobRequest } from '../types/ingestion';

const img = (imageType: string) => ({ imageType: imageType as never, s3Key: `k/${imageType}`, s3Bucket: 'b' });

const valid: IngestJobRequest = {
  externalRef: 'WC-123',
  postcode: 'SW1A 1AA',
  vehicle: { make: 'Ford', model: 'Focus', year: 2020, vehicleSize: 'MEDIUM' },
  incidentNotes: 'front bumper scrape',
  images: [img('REGISTRATION_PLATE'), img('DAMAGE_ANGLE_1'), img('DAMAGE_ANGLE_2'), img('DAMAGE_ANGLE_3')],
};

describe('validateIngestJob', () => {
  it('accepts a well-formed payload', () => {
    expect(validateIngestJob(valid)).toEqual({ ok: true });
  });

  it('requires externalRef', () => {
    expect(validateIngestJob({ ...valid, externalRef: '  ' }).reason).toBe('MISSING_FIELDS');
  });

  it('requires postcode', () => {
    expect(validateIngestJob({ ...valid, postcode: '' }).reason).toBe('MISSING_FIELDS');
  });

  it('requires vehicle make or registration', () => {
    expect(validateIngestJob({ ...valid, vehicle: { model: 'Focus' } }).reason).toBe('MISSING_FIELDS');
    expect(validateIngestJob({ ...valid, vehicle: { registrationNo: 'AB12CDE' } }).ok).toBe(true);
  });

  it('requires the minimum photo count', () => {
    const r = validateIngestJob({ ...valid, images: valid.images.slice(0, 3) });
    expect(r.reason).toBe('TOO_FEW_PHOTOS');
  });

  it('rejects images missing s3 references', () => {
    const bad = [...valid.images.slice(0, 3), { imageType: 'DAMAGE_ANGLE_3' as never, s3Key: '', s3Bucket: 'b' }];
    expect(validateIngestJob({ ...valid, images: bad }).reason).toBe('MISSING_FIELDS');
  });

  it('rejects duplicate image angles', () => {
    const dupes = [img('DAMAGE_ANGLE_1'), img('DAMAGE_ANGLE_1'), img('DAMAGE_ANGLE_2'), img('DAMAGE_ANGLE_3')];
    expect(validateIngestJob({ ...valid, images: dupes }).detail).toMatch(/duplicate/);
  });
});
