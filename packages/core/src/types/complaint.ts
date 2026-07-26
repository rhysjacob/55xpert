/** Where a complaint originated (TRX-24). */
export const ComplaintSource = {
  /** Raised by a warranty company against one of its network repairers. */
  WARRANTY_COMPANY: 'WARRANTY_COMPANY',
  /** Raised directly by the end customer / garage-direct. */
  CUSTOMER_DIRECT: 'CUSTOMER_DIRECT',
} as const;
export type ComplaintSource = (typeof ComplaintSource)[keyof typeof ComplaintSource];

/**
 * Assessment state of a complaint. A complaint is logged as OPEN (not yet
 * assessed), then an admin marks it JUSTIFIED or UNJUSTIFIED — the split that
 * feeds the complaints-vs-volume MI (TRX-27).
 */
export const ComplaintStatus = {
  OPEN: 'OPEN',
  JUSTIFIED: 'JUSTIFIED',
  UNJUSTIFIED: 'UNJUSTIFIED',
} as const;
export type ComplaintStatus = (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

/**
 * A complaint recorded against a repairer organisation (TRX-24). Source is a
 * warranty company or a garage-direct customer. `status` carries the
 * justified/unjustified assessment; date/time is auto-captured on create.
 * `repairerName` is denormalised so the admin list needs no join.
 */
export interface Complaint {
  complaintId: string;
  /** The repairer organisation the complaint is against. */
  organisationId: string;
  /** Denormalised org name for listing. */
  repairerName: string;
  source: ComplaintSource;
  status: ComplaintStatus;
  /** Free-text description of the complaint. */
  note: string;
  /** Optional link to the specific job the complaint relates to. */
  jobId?: string;
  /** Optional — the warranty company that raised it (scopes per-company MI). */
  warrantyCompanyId?: string;
  /** Admin user who logged the complaint. */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the complaint is marked justified/unjustified. */
  resolvedAt?: string;
}
