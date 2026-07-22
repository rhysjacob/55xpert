import type { EventBridgeEvent } from 'aws-lambda';
import type Stripe from 'stripe';
import { logger } from '../../lib/logger';
import { UsersRepository } from '@corexpert/db';
import type { SubscriptionStatus } from '@corexpert/core';

const users = new UsersRepository();

/**
 * Processes Stripe events delivered via Amazon EventBridge (the Stripe partner
 * event source). No signature verification and no public endpoint — delivery is
 * authenticated through the Stripe↔AWS partner integration, and EventBridge
 * provides retries/DLQ. The Stripe Event object arrives in `event.detail`.
 *
 * Under monthly billing the only inbound events we act on are the repairer
 * subscription lifecycle (created/updated/deleted). Match fees are Stripe
 * invoice items that flow onto the monthly invoice — no per-event handling.
 */
export async function handler(
  event: EventBridgeEvent<string, Stripe.Event>,
): Promise<void> {
  const stripeEvent = event.detail;
  logger.info('Stripe event via EventBridge', { type: stripeEvent.type, id: stripeEvent.id });

  switch (stripeEvent.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(stripeEvent.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription);
      break;
    case 'checkout.session.completed':
      await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session);
      break;
    default:
      logger.info('Unhandled Stripe event type', { type: stripeEvent.type });
  }
}

/** Keep the repairer's stored subscription status in sync with Stripe. */
async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const userId = sub.metadata?.['userId'];
  if (!userId) {
    logger.warn('Subscription event without userId metadata', { subscriptionId: sub.id });
    return;
  }
  await users.setRepairerSubscription(userId, sub.id, sub.status as SubscriptionStatus);
  logger.info('Repairer subscription updated', { userId, subscriptionId: sub.id, status: sub.status });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.['userId'];
  if (!userId) return;
  await users.setRepairerSubscription(userId, sub.id, 'canceled');
  logger.info('Repairer subscription canceled', { userId, subscriptionId: sub.id });
}

/** The subscription-start Checkout completing — record it + mark active. */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;
  const userId = session.metadata?.['userId'];
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (userId && subscriptionId) {
    await users.setRepairerSubscription(userId, subscriptionId, 'active');
    logger.info('Repairer subscription started', { userId, subscriptionId });
  }
}
