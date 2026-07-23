import type { IngestJobRequest, RejectionReason } from '../types/ingestion';

/** Photos required before a job can be triaged (mirrors the consumer 4-angle rule). */
export const MIN_INGEST_PHOTOS = 4;

export interface IngestValidationResult {
  ok: boolean;
  reason?: RejectionReason;
  detail?: string;
}

/**
 * Structural validation of an inbound ingestion payload (TRX-5): required
 * fields present, at least the minimum photos, and no duplicate image angles.
 * Duplicate-job detection (same externalRef already seen) is a stateful check
 * done at the handler with the ingestion store, not here.
 *
 * Pure and total — returns the first failing reason so the caller can auto-reject
 * with a stable code (TRX-9).
 */
export function validateIngestJob(req: IngestJobRequest): IngestValidationResult {
  if (!req.externalRef?.trim()) {
    return { ok: false, reason: 'MISSING_FIELDS', detail: 'externalRef is required' };
  }
  if (!req.postcode?.trim()) {
    return { ok: false, reason: 'MISSING_FIELDS', detail: 'postcode is required' };
  }
  if (!req.vehicle || (!req.vehicle.make && !req.vehicle.registrationNo)) {
    return {
      ok: false,
      reason: 'MISSING_FIELDS',
      detail: 'vehicle make or registrationNo is required',
    };
  }

  const images = req.images ?? [];
  if (images.length < MIN_INGEST_PHOTOS) {
    return {
      ok: false,
      reason: 'TOO_FEW_PHOTOS',
      detail: `at least ${MIN_INGEST_PHOTOS} photos are required, got ${images.length}`,
    };
  }
  if (images.some((img) => !img.s3Key?.trim() || !img.s3Bucket?.trim())) {
    return { ok: false, reason: 'MISSING_FIELDS', detail: 'every image needs s3Key and s3Bucket' };
  }
  // Reject duplicate angles — the same imageType sent twice means a missing view.
  const angles = images.map((img) => img.imageType);
  if (new Set(angles).size !== angles.length) {
    return { ok: false, reason: 'MISSING_FIELDS', detail: 'duplicate image angles' };
  }

  return { ok: true };
}
