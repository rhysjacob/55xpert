import type { Vehicle } from './vehicle';
import type { ImageType, TriageResult, XpertReview } from './triage';
import type { ImageForensics } from './fraud';

export const CaseStatus = {
  DRAFT: 'DRAFT',
  IMAGES_UPLOADED: 'IMAGES_UPLOADED',
  TRIAGE_PENDING: 'TRIAGE_PENDING',
  TRIAGE_FAILED: 'TRIAGE_FAILED',
  TRIAGE_COMPLETE: 'TRIAGE_COMPLETE',
  XPERT_REVIEW: 'XPERT_REVIEW',
  /** Breaks a work-acceptance rule (too many panels, damage too large, excluded panel). Terminal. */
  INELIGIBLE: 'INELIGIBLE',
  PUBLISHED: 'PUBLISHED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export interface CaseImage {
  imageType: ImageType;
  s3Key: string;
  s3Bucket: string;
  originalFilename?: string;
  mimeType?: string;
  uploadedAt: string;
  /** Forensic data extracted at triage time (EXIF, hashes). Best-effort. */
  forensics?: ImageForensics;
}

export interface Case {
  caseId: string;
  referenceNo: string;
  userId: string;
  status: CaseStatus;
  /**
   * The warranty company this case belongs to (multi-tenancy phase 3). Absent
   * for consumer-originated single-tenant cases; when set it is inherited by
   * the published job so matching can scope to that company's network (TRX-78).
   */
  warrantyCompanyId?: string;
  /** How the case originated. Absent/CONSUMER for consumer uploads; INGESTED
   *  for warranty-company job push (TRX-14/79) — drives a shorter job expiry. */
  origin?: 'CONSUMER' | 'INGESTED';
  /** The warranty company's own job reference, for ingested cases (dedupe). */
  externalRef?: string;
  postcode?: string;
  incidentDate?: string;
  incidentNotes?: string;
  vehicle?: Vehicle;
  images: CaseImage[];
  triageResult?: TriageResult;
  xpertReviews: XpertReview[];
  createdAt: string;
  updatedAt: string;
}
