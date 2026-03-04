import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import Stripe from 'stripe';
import { jsonResponse } from '../../lib/response';
import { logger } from '../../lib/logger';
import { PaymentsRepository } from '@corexpert/db';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from '@corexpert/db';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'] ?? '';
const STRIPE_WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
const payments = new PaymentsRepository();

/**
 * Stripe webhook handler. No JWT auth — validates via Stripe signature.
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const signature = event.headers['stripe-signature'];
  if (!signature || !event.body) {
    return jsonResponse(400, { error: 'Missing signature or body' });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', err);
    return jsonResponse(400, { error: 'Invalid signature' });
  }

  logger.info('Stripe webhook received', {
    type: stripeEvent.type,
    id: stripeEvent.id,
  });

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    case 'checkout.session.expired': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      await handleCheckoutExpired(session);
      break;
    }
    default:
      logger.info('Unhandled webhook event type', { type: stripeEvent.type });
  }

  return jsonResponse(200, { received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
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
