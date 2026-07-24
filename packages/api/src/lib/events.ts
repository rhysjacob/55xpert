import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// App domain events → the shared EventBridge bus. Producers emit; consumers
// (notifications, etc.) subscribe by detail-type via CDK rules. This is the
// decoupling seam: the core flow (publish a job) never calls email/WhatsApp
// directly — it emits an event and moves on. Best-effort: a telemetry failure
// must never break the primary operation, so this never throws.
// ---------------------------------------------------------------------------

const client = new EventBridgeClient({});

/** Our event source, used in the CDK rule patterns. */
export const APP_EVENT_SOURCE = 'corexpert.app';

/** Known domain event detail-types. */
export const DomainEvent = {
  JOB_PUBLISHED: 'job.published',
} as const;
export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent];

/** Emit a domain event to the app bus. Never throws. */
export async function emitDomainEvent(detailType: DomainEvent, detail: unknown): Promise<void> {
  const busName = process.env['EVENT_BUS_NAME'];
  if (!busName) {
    logger.warn('EVENT_BUS_NAME not set — event not emitted', { detailType });
    return;
  }
  try {
    await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: APP_EVENT_SOURCE,
            DetailType: detailType,
            Detail: JSON.stringify(detail ?? {}),
          },
        ],
      }),
    );
  } catch (err) {
    logger.error('Failed to emit domain event', { detailType, err: String(err) });
  }
}
