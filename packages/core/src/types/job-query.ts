/**
 * Assessment state of a repairer's post-acceptance query (TRX-57).
 * OPEN when raised, ANSWERED once an Xpert responds, CLOSED when resolved.
 */
export const JobQueryStatus = {
  OPEN: 'OPEN',
  ANSWERED: 'ANSWERED',
  CLOSED: 'CLOSED',
} as const;
export type JobQueryStatus = (typeof JobQueryStatus)[keyof typeof JobQueryStatus];

/**
 * A "raise a question / refer to an expert" request on an ACCEPTED job (TRX-57)
 * — the deliberate "get out of jail" flow that routes a repairer's concern to an
 * Xpert instead of offering a one-click reject. The match fee stands regardless;
 * this is help, not a cancellation. Routed to the team by email today, and
 * WhatsApp once that channel is live (see docs/whatsapp-feasibility.md).
 */
export interface JobQuery {
  queryId: string;
  jobId: string;
  caseId?: string;
  /** Repairer (user) who raised it + denormalised name for the queue. */
  repairerId: string;
  repairerName?: string;
  organisationId?: string;
  /** Tenant, inherited from the job (TRX-77). */
  warrantyCompanyId?: string;
  /** Denormalised vehicle summary for the admin queue. */
  vehicle?: string;
  status: JobQueryStatus;
  question: string;
  response?: string;
  /** Xpert/admin who answered. */
  answeredBy?: string;
  answeredAt?: string;
  createdAt: string;
  updatedAt: string;
}
