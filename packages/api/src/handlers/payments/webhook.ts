import type { EventBridgeEvent } from 'aws-lambda';
import type Stripe from 'stripe';
import { logger } from '../../lib/logger';
import { PaymentsRepository, UsersRepository } from '@corexpert/db';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from '@corexpert/db';
import type { SubscriptionStatus } from '@corexpert/core';

const payments = new PaymentsRepository();
const users = new UsersRepository();

/**
 * Processes Stripe events delivered via Amazon EventBridge (the Stripe partner
 * event source). No signature verification and no public endpoint — delivery is
 * authenticated through the Stripe↔AWS partner integration, and EventBridge
 * provides retries/DLQ. The Stripe Event object arrives in `event.detail`.
 */
export async function handler(
  event: EventBridgeEvent<string, Stripe.Event>,
): Promise<void> {
  const stripeEvent = event.detail;
  logger.info('Stripe event via EventBridge', { type: stripeEvent.type, id: stripeEvent.id });

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session);
      break;
    case 'checkout.session.expired':
      await handleCheckoutExpired(stripeEvent.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      await handleSubscriptionChange(stripeEvent.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription);
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

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Subscription checkout: record the subscription + mark active. (Ongoing
  // status changes arrive via customer.subscription.* events.)
  if (session.mode === 'subscription') {
    const userId = session.metadata?.['userId'];
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (userId && subscriptionId) {
      await users.setRepairerSubscription(userId, subscriptionId, 'active');
      logger.info('Repairer subscription started', { userId, subscriptionId });
    }
    return;
  }

  const paymentId = session.metadata?.['paymentId'];
  const jobId = session.metadata?.['jobId'];

  if (!paymentId || !jobId) {
    logger.error('Missing metadata in checkout session', undefined, { sessionId: session.id });
    return;
  }

  // Update payment status
  await payments.updateStatus(paymentId, 'SUCCEEDED');

  // Update payment with Stripe payment intent ID
  if (session.payment_intent) {
    const intentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent.id;

    await docClient.send(new UpdateCommand({
      TableName: TABLES.PAYMENTS,
      Key: { paymentId },
      UpdateExpression: 'SET stripePaymentIntentId = :intentId, paidAt = :now',
      ExpressionAttributeValues: {
        ':intentId': intentId,
        ':now': new Date().toISOString(),
      },
    }));
  }

  // Update job acceptance with paymentId
  await docClient.send(new UpdateCommand({
    TableName: TABLES.JOBS,
    Key: { jobId },
    UpdateExpression: 'SET acceptance.paymentId = :paymentId, updatedAt = :now',
    ExpressionAttributeValues: {
      ':paymentId': paymentId,
      ':now': new Date().toISOString(),
    },
  }));

  logger.info('Payment completed', { paymentId, jobId });
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.['paymentId'];
  const jobId = session.metadata?.['jobId'];

  if (!paymentId || !jobId) return;

  await payments.updateStatus(paymentId, 'FAILED');

  // Revert job acceptance — set status back to OPEN
  await docClient.send(new UpdateCommand({
    TableName: TABLES.JOBS,
    Key: { jobId },
    UpdateExpression: 'SET #status = :open, acceptance = :empty, updatedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':open': 'OPEN',
      ':empty': null,
      ':now': new Date().toISOString(),
    },
  }));

  logger.info('Checkout expired, job reverted to OPEN', { paymentId, jobId });
}
