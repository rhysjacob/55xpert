export const JobStatus = {
  OPEN: 'OPEN',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export interface JobLocation {
  postcode: string;
  lat?: number;
  lng?: number;
  area?: string;
}

export interface JobVehicleSummary {
  make?: string;
  model?: string;
  year?: number;
  vehicleSize?: string;
}

export interface JobAcceptance {
  repairerId: string;
  acceptedAt: string;
  /** Stripe invoice-item id for the match fee accrued at acceptance. */
  matchFeeInvoiceItemId?: string;
  /** @deprecated Legacy per-job payment id (pre-monthly-billing). */
  paymentId?: string;
}

export interface Job {
  jobId: string;
  caseId: string;
  status: JobStatus;
  publishedAt?: string;
  expiresAt?: string;
  introductionFee: number;
  labourRate?: number;
  location: JobLocation;
  vehicleSummary: JobVehicleSummary;
  damageSummary: string;
  repairMethods: string[];
  indicativeCost: number;
  acceptance?: JobAcceptance;
  notificationsSent: number;
  createdAt: string;
  /**
   * The warranty company the job originates from (inherited from the case).
   * When set, matching is scoped to that company's enabled network (TRX-78);
   * when absent the job is untenanted and reaches all matchable repairers.
   */
  warrantyCompanyId?: string;
  /**
   * Organisations an admin has manually pushed this job to (TRX-20). These see
   * the job regardless of automatic matching — an override, not a replacement.
   */
  pushedOrganisationIds?: string[];
}
