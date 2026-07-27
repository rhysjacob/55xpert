export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export interface Payment {
  paymentId: string;
  jobId: string;
  /** Tenant, inherited from the job/case (TRX-77). Set at creation when a payment-write path exists. */
  warrantyCompanyId?: string;
  repairerId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  paidAt?: string;
  createdAt: string;
}
