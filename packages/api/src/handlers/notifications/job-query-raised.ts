import type { EventBridgeEvent } from 'aws-lambda';
import { JobQueriesRepository } from '@corexpert/db';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/email';
import { expertQueryEmail } from '../../lib/email-templates';

const queries = new JobQueriesRepository();

interface JobQueryRaisedDetail {
  queryId: string;
}

/**
 * EventBridge consumer for `job.query.raised` (TRX-57): alert the Xpert team
 * that a repairer has referred a job to an expert. Decoupled from the request —
 * the raise handler just emits the event. Email today; WhatsApp once that
 * channel is live (docs/whatsapp-feasibility.md). Best-effort per the notifier
 * pattern; a delivery failure is logged, not thrown.
 */
export async function handler(
  event: EventBridgeEvent<'job.query.raised', JobQueryRaisedDetail>,
): Promise<void> {
  const { queryId } = event.detail;
  const query = await queries.getById(queryId);
  if (!query) {
    logger.warn('job.query.raised for unknown query', { queryId });
    return;
  }

  const to = process.env['EXPERT_QUEUE_EMAIL'] ?? process.env['LEADS_EMAIL'];
  if (!to) {
    logger.warn('No EXPERT_QUEUE_EMAIL configured — expert query not emailed', { queryId });
    return;
  }
  try {
    await sendEmail({ to, ...expertQueryEmail(query) });
    logger.info('Expert query alert sent', { queryId, to });
  } catch (err) {
    logger.error('Expert query alert failed', { queryId, err: String(err) });
  }
}
