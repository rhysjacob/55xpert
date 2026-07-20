import { logger } from '../../lib/logger';
import { JobsRepository, CasesRepository, PaymentsRepository } from '@corexpert/db';
import { CaseStatus } from '@corexpert/core';
import { getPaymentGraceMinutes } from '../../lib/job-settings';

const jobs = new JobsRepository();
const cases = new CasesRepository();
const payments = new PaymentsRepository();

/** Cap per run so a backlog can't run the Lambda past its timeout. */
const MAX_PAGES = 20;

/**
 * Scheduled sweep: return accepted-but-unpaid jobs to the Xchange.
 *
 * Accepting a job locks it to one repairer, but payment is a separate step.
 * Stripe's `checkout.session.expired` webhook already covers repairers who
 * started checkout and abandoned it; this covers the larger gap — repairers who
 * accepted and never started checkout at all, for whom no Stripe session (and
 * so no webhook) exists. Without this, such a job stays ACCEPTED forever:
 * invisible to other repairers and earning no introduction fee.
 */
export async function handler(): Promise<{ scanned: number; released: number }> {
  const graceMinutes = await getPaymentGraceMinutes();
  const cutoff = new Date(Date.now() - graceMinutes * 60_000);

  let scanned = 0;
  let released = 0;
  let lastKey: Record<string, unknown> | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await jobs.listByStatus('ACCEPTED', 100, lastKey);

    for (const job of result.items) {
      scanned++;

      const acceptance = job.acceptance;
      if (!acceptance?.acceptedAt) continue;

      // Still inside the grace window.
      if (new Date(acceptance.acceptedAt) > cutoff) continue;

      // A succeeded payment means the job is legitimately held. Anything else —
      // no payment record, or one still pending/failed — is unpaid.
      if (acceptance.paymentId) {
        const payment = await payments.getById(acceptance.paymentId);
        if (payment?.status === 'SUCCEEDED') continue;
      }

      const didRelease = await jobs.releaseUnpaidAcceptance(job.jobId, acceptance.acceptedAt);
      if (!didRelease) {
        // Paid or re-accepted between the read and the write — leave it be.
        logger.info('Skipped release, job changed under us', { jobId: job.jobId });
        continue;
      }

      // Accepting moved the case to ACCEPTED; releasing must move it back so the
      // consumer does not see a repairer that no longer holds the job.
      await cases.updateStatus(job.caseId, CaseStatus.PUBLISHED);

      released++;
      logger.info('Released unpaid acceptance', {
        jobId: job.jobId,
        caseId: job.caseId,
        repairerId: acceptance.repairerId,
        acceptedAt: acceptance.acceptedAt,
        graceMinutes,
      });
    }

    lastKey = result.lastKey;
    if (!lastKey) break;
  }

  if (lastKey) {
    logger.warn('Sweep hit page cap; remaining jobs deferred to next run', { MAX_PAGES });
  }

  logger.info('Unpaid-acceptance sweep complete', { scanned, released, graceMinutes });
  return { scanned, released };
}
