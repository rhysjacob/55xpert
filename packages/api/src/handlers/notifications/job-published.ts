import type { EventBridgeEvent } from 'aws-lambda';
import { JobsRepository, UsersRepository } from '@corexpert/db';
import { evaluateMatch } from '@corexpert/core';
import { logger } from '../../lib/logger';
import { resolveMatchTarget, jobToMatchInput } from '../../lib/matching';
import { getEmailSender } from '../../lib/email';
import { jobAlertEmail } from '../../lib/email-templates';
import { getWhatsAppSender, jobAlertWhatsApp } from '../../lib/whatsapp';

const jobs = new JobsRepository();
const users = new UsersRepository();

interface JobPublishedDetail {
  jobId: string;
}

/**
 * EventBridge consumer for `job.published` (TRX-60): email every repairer the
 * job matches and who has email alerts on. Decoupled from publishing — the
 * publish flow just emits the event. Runs the same matching engine the job
 * list uses, so alerts and visibility stay consistent. Per-recipient failures
 * are logged and skipped; the job is re-fetched to avoid alerting on a job that
 * was already taken/expired between publish and delivery.
 */
export async function handler(
  event: EventBridgeEvent<'job.published', JobPublishedDetail>,
): Promise<void> {
  const { jobId } = event.detail;
  const job = await jobs.getById(jobId);
  if (!job) {
    logger.warn('job.published for unknown job', { jobId });
    return;
  }
  if (job.status !== 'OPEN') {
    logger.info('Skipping alerts — job no longer open', { jobId, status: job.status });
    return;
  }

  const input = jobToMatchInput(job);
  const email = getEmailSender();
  const whatsapp = getWhatsAppSender();

  let scanned = 0;
  let notified = 0;
  let notifiedWhatsApp = 0;
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await users.listByRole('REPAIRER', 100, cursor);
    for (const user of page.items) {
      scanned += 1;
      const target = await resolveMatchTarget(user);
      if (!target || !evaluateMatch(input, target).matched) continue;

      // Email — opt-out respected; undefined preference defaults to on.
      if (user.email && user.preferences?.notifyByEmail !== false) {
        try {
          await email.send({ to: user.email, ...jobAlertEmail(job, user.firstName) });
          notified += 1;
        } catch (err) {
          logger.error('Job alert email failed', { jobId, userId: user.userId, err: String(err) });
        }
      }

      // WhatsApp — additional channel, opt-IN only (TRX-61). No-op while the
      // sender is dormant, so this is inert until credentials are configured.
      const wa = user.preferences?.whatsappNumber;
      if (whatsapp.configured && user.preferences?.notifyByWhatsApp && wa) {
        try {
          await whatsapp.send(jobAlertWhatsApp(job, wa));
          notifiedWhatsApp += 1;
        } catch (err) {
          logger.error('Job alert WhatsApp failed', { jobId, userId: user.userId, err: String(err) });
        }
      }
    }
    cursor = page.lastKey;
  } while (cursor);

  logger.info('Job alerts processed', { jobId, scanned, notified, notifiedWhatsApp });
}
