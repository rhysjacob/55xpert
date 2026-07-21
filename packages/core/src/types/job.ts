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
}
