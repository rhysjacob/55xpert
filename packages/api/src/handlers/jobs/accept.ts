import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { getPathParam } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { JobsRepository, CasesRepository, UsersRepository } from '@corexpert/db';
import { NotFoundError, ConflictError, ForbiddenError, isSubscriptionActive, evaluateMatch } from '@corexpert/core';
import type { CaseStatus, JobAcceptance } from '@corexpert/core';
import { createMatchFeeInvoiceItem } from '../../lib/stripe';
import { resolveMatchTarget, jobToMatchInput } from '../../lib/matching';

const jobs = new JobsRepository();
const cases = new CasesRepository();
const users = new UsersRepository();

async function acceptHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const jobId = getPathParam(event, 'jobId');

  // Gate: only repairers with an active subscription (card on file) can accept.
  const repairer = await users.getById(auth.userId);
  if (!isSubscriptionActive(repairer?.repairer?.subscriptionStatus)) {
    throw new ForbiddenError('An active subscription is required to accept jobs');
  }

  const job = await jobs.getById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
    throw new ConflictError('This job has expired');
  }

  // Enforce matching: a repairer may only accept a job they match (network,
  // capability, coverage) or that an admin pushed to their org (TRX-20). Without
  // this the matched list would be merely advisory — a guessed jobId could win
  // an out-of-area job.
  const target = repairer ? await resolveMatchTarget(repairer) : null;
  const pushed = !!target?.organisationId && (job.pushedOrganisationIds ?? []).includes(target.organisationId);
  if (!pushed && !(target && evaluateMatch(jobToMatchInput(job), target).matched)) {
    throw new ForbiddenError('This job is not available to you');
  }

  // Win the job first (fastest-finger conditional write), then charge — so a
  // lost race never bills the repairer.
  const acceptance: JobAcceptance = {
    repairerId: auth.userId,
    acceptedAt: new Date().toISOString(),
  };
  const accepted = await jobs.acceptJob(jobId, acceptance);
  if (!accepted) {
    throw new ConflictError('This job has already been accepted by another repairer');
  }

  await cases.updateStatus(job.caseId, 'ACCEPTED' as CaseStatus);

  // Accrue the match fee to the repairer's monthly invoice. Best-effort: if this
  // fails the job stays accepted (they've already won it and can see the
  // details) — the fee is reconciled rather than blocking the accept.
  const customerId = repairer!.repairer!.stripeCustomerId;
  if (customerId) {
    try {
      const invoiceItemId = await createMatchFeeInvoiceItem({
        customerId,
        amountPence: job.introductionFee,
        description: `Match fee — job ${jobId} (${job.vehicleSummary?.make ?? ''} ${job.vehicleSummary?.model ?? ''})`.trim(),
        metadata: { jobId, repairerId: auth.userId },
      });
      await jobs.setMatchFeeInvoiceItem(jobId, invoiceItemId);
      logger.info('Match fee accrued', { jobId, repairerId: auth.userId, invoiceItemId });
    } catch (err) {
      logger.error('Failed to accrue match fee; job remains accepted', { jobId, repairerId: auth.userId, err: String(err) });
    }
  } else {
    logger.error('Accepting repairer has no Stripe customer; match fee not accrued', { jobId, repairerId: auth.userId });
  }

  logger.info('Job accepted', { jobId, repairerId: auth.userId, caseId: job.caseId });

  return ok({
    jobId,
    accepted: true,
    matchFee: job.introductionFee,
    message: 'Job accepted. The match fee has been added to your next monthly invoice.',
  });
}

export const handler = withErrorHandler(acceptHandler);
