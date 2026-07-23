import { logger } from './logger';
import type { WarrantyCompany, RejectionReason } from '@corexpert/core';

/** An outbound event we tell a warranty company about (TRX-9/10/36). */
export type WarrantyNotification =
  | { event: 'job.rejected'; externalRef: string; reason: RejectionReason; detail: string }
  | { event: 'job.published'; externalRef: string; caseId: string; jobId: string }
  | { event: 'job.expired'; externalRef: string; caseId: string };

/**
 * Notify a warranty company of a change to one of their ingested jobs
 * (rejection reason, published, expired). The DELIVERY mechanism — a callback
 * URL / webhook / their inbound API — is TRX-15, an external dependency undefined
 * until a first partner's contract exists. Until then this is the seam: we log
 * the notification (and the polling feedback endpoint, TRX-36, is the fallback
 * the company can read). Wire a real transport in here when TRX-15 lands.
 */
export async function notifyWarrantyCompany(
  company: WarrantyCompany,
  notification: WarrantyNotification,
): Promise<void> {
  logger.info('Warranty-company notification (delivery pending TRX-15)', {
    warrantyCompanyId: company.warrantyCompanyId,
    ...notification,
  });
  // TRX-15: POST to the company's callback endpoint with their auth here.
  return Promise.resolve();
}
