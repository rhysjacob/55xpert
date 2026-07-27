import type { VehicleSize } from './vehicle';
import type { ImageType } from './triage';

/**
 * Warranty-company job ingestion (TRX-14/79). A warranty company's system pushes
 * a job to us; we map it to an internal, tenant-stamped case that runs the
 * normal triage → eligibility → publish flow, bypassing consumer upload.
 *
 * This is the CANONICAL inbound contract. Each real warranty company's own API
 * shape (field names, auth, how images are delivered) is TRX-15 — an external
 * dependency, undefined until we have a first integration partner. A per-company
 * adapter maps their payload onto this canonical shape; nothing downstream needs
 * to know the difference.
 */
export interface IngestJobImage {
  imageType: ImageType;
  /** An image already uploaded to our S3 via the ingest presigned-upload step. */
  s3Key: string;
  s3Bucket: string;
}

export interface IngestJobRequest {
  /** The company's own reference for this job — used to dedupe re-sends. */
  externalRef: string;
  postcode: string;
  vehicle: {
    registrationNo?: string;
    make?: string;
    model?: string;
    year?: number;
    vehicleSize?: VehicleSize;
  };
  incidentNotes?: string;
  images: IngestJobImage[];
}

/** Why an ingested job was auto-rejected (TRX-9) — a stable machine code. */
export const RejectionReason = {
  MISSING_FIELDS: 'MISSING_FIELDS',
  TOO_FEW_PHOTOS: 'TOO_FEW_PHOTOS',
  DUPLICATE: 'DUPLICATE',
  INELIGIBLE: 'INELIGIBLE',
  /** Repair estimate ≥ the scheme's total-loss threshold of vehicle value (TRX-6). */
  TOTAL_LOSS: 'TOTAL_LOSS',
  TRIAGE_FAILED: 'TRIAGE_FAILED',
} as const;
export type RejectionReason = (typeof RejectionReason)[keyof typeof RejectionReason];

/** Lifecycle of an ingested job on our side (fed back to the company, TRX-36). */
export const IngestionStatus = {
  ACCEPTED: 'ACCEPTED', // taken in, triage running
  PUBLISHED: 'PUBLISHED', // live on the Xchange
  REJECTED: 'REJECTED', // auto-rejected — see reason
} as const;
export type IngestionStatus = (typeof IngestionStatus)[keyof typeof IngestionStatus];

/**
 * The record of one ingestion attempt — the dedupe key and the feedback the
 * warranty company can poll (TRX-36). Keyed by (warrantyCompanyId, externalRef).
 */
export interface IngestionRecord {
  warrantyCompanyId: string;
  externalRef: string;
  status: IngestionStatus;
  /** Set on our side once a case exists. */
  caseId?: string;
  /** Present when status is REJECTED. */
  rejectionReason?: RejectionReason;
  rejectionDetail?: string;
  createdAt: string;
  updatedAt: string;
}
