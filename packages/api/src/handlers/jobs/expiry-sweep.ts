import { JobsRepository, CasesRepository, WarrantyCompaniesRepository, IngestionsRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import { notifyWarrantyCompany } from '../../lib/warranty-notify';

const jobs = new JobsRepository();
const cases = new CasesRepository();
const warrantyCompanies = new WarrantyCompaniesRepository();
const ingestions = new IngestionsRepository();

/**
 * Scheduled sweeper (TRX-10): expire OPEN jobs past their `expiresAt`. Ingested
 * (warranty-company) jobs carry a 48h expiry vs 7 days for consumer jobs; when
 * one lapses unaccepted we flip it to EXPIRED and hand it back to the company
 * (notify + ingestion status). EventBridge invokes this on a fixed cadence.
 */
export async function handler(): Promise<void> {
  const now = Date.now();
  let scanned = 0;
  let expired = 0;
  let cursor: Record<string, unknown> | undefined;

  do {
    const page = await jobs.listByStatus('OPEN', 100, cursor);
    for (const job of page.items) {
      scanned += 1;
      if (!job.expiresAt || new Date(job.expiresAt).getTime() > now) continue;
      const didExpire = await jobs.expireJob(job.jobId);
      if (!didExpire) continue; // accepted in the meantime
      expired += 1;

      // Hand an ingested job back to its warranty company (TRX-10/36).
      if (job.warrantyCompanyId) {
        const caseData = await cases.getById(job.caseId);
        if (caseData?.origin === 'INGESTED' && caseData.externalRef) {
          await ingestions.setStatus(job.warrantyCompanyId, caseData.externalRef, 'REJECTED', {
            rejectionReason: 'INELIGIBLE',
            rejectionDetail: 'Expired unaccepted after 48h',
          });
          const company = await warrantyCompanies.getById(job.warrantyCompanyId);
          if (company) {
            await notifyWarrantyCompany(company, {
              event: 'job.expired',
              externalRef: caseData.externalRef,
              caseId: job.caseId,
            });
          }
        }
      }
    }
    cursor = page.lastKey;
  } while (cursor);

  logger.info('Job expiry sweep complete', { scanned, expired });
}
