import { IngestionsRepository, WarrantyCompaniesRepository } from '@corexpert/db';
import type { Case, RejectionReason } from '@corexpert/core';
import { notifyWarrantyCompany } from './warranty-notify';

const ingestions = new IngestionsRepository();
const warrantyCompanies = new WarrantyCompaniesRepository();

/**
 * Feed a rejection outcome back to a warranty company for one of their ingested
 * cases (TRX-9/36): record the reason on the ingestion and notify them. No-op
 * for consumer-originated cases. Best-effort — callers should not fail their
 * primary work if feedback delivery has an issue.
 */
export async function rejectIngestedCase(
  caseData: Pick<Case, 'origin' | 'warrantyCompanyId' | 'externalRef'>,
  reason: RejectionReason,
  detail: string,
): Promise<void> {
  if (caseData.origin !== 'INGESTED' || !caseData.warrantyCompanyId || !caseData.externalRef) return;
  await ingestions.setStatus(caseData.warrantyCompanyId, caseData.externalRef, 'REJECTED', {
    rejectionReason: reason,
    rejectionDetail: detail,
  });
  const company = await warrantyCompanies.getById(caseData.warrantyCompanyId);
  if (company) {
    await notifyWarrantyCompany(company, {
      event: 'job.rejected',
      externalRef: caseData.externalRef,
      reason,
      detail,
    });
  }
}
