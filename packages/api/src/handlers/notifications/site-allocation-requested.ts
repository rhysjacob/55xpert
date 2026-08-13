import type { EventBridgeEvent } from 'aws-lambda';
import { CasesRepository, UsersRepository, WarrantyCompaniesRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/email';
import { siteAllocationRequestEmail } from '../../lib/email-templates';

const cases = new CasesRepository();
const users = new UsersRepository();
const companies = new WarrantyCompaniesRepository();

interface SiteAllocationRequestedDetail {
  caseId: string;
}

/**
 * EventBridge consumer for `case.site-allocation.requested`: alert the team who
 * allocate work to sites that a customer wants a referred case taken on at one
 * of the warranty company's own sites.
 *
 * The recipient is an env address, not per-company data: WarrantyCompany has no
 * contact on it yet, and inventing one here would put a second, unmanaged copy
 * of a company's details next to the real one (TRX-15 is where a company's
 * outbound channel gets defined). The company name is in the email so a shared
 * queue can route it. Best-effort per the notifier pattern.
 */
export async function handler(
  event: EventBridgeEvent<'case.site-allocation.requested', SiteAllocationRequestedDetail>,
): Promise<void> {
  const { caseId } = event.detail;
  const caseData = await cases.getById(caseId);
  if (!caseData) {
    logger.warn('case.site-allocation.requested for unknown case', { caseId });
    return;
  }

  const to = process.env['SITE_ALLOCATION_EMAIL'] ?? process.env['EXPERT_QUEUE_EMAIL'] ?? process.env['LEADS_EMAIL'];
  if (!to) {
    logger.warn('No SITE_ALLOCATION_EMAIL configured — allocation request not emailed', { caseId });
    return;
  }

  // Both lookups are decoration on the email; neither is worth failing over.
  const [company, consumer] = await Promise.all([
    caseData.warrantyCompanyId
      ? companies.getById(caseData.warrantyCompanyId).catch(() => undefined)
      : Promise.resolve(undefined),
    users.getById(caseData.userId).catch(() => undefined),
  ]);

  try {
    await sendEmail({
      to,
      ...siteAllocationRequestEmail({
        caseData,
        ...(company?.name ? { companyName: company.name } : {}),
        ...(consumer ? { consumerName: `${consumer.firstName} ${consumer.lastName}`.trim() } : {}),
        ...(consumer?.email ? { consumerEmail: consumer.email } : {}),
      }),
    });
    logger.info('Site allocation request alert sent', {
      caseId,
      to,
      warrantyCompanyId: caseData.warrantyCompanyId,
    });
  } catch (err) {
    logger.error('Site allocation request alert failed', { caseId, err: String(err) });
  }
}
