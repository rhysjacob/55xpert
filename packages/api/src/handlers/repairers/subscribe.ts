import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { UsersRepository } from '@corexpert/db';
import { NotFoundError, ValidationError } from '@corexpert/core';
import { getStripe, createStripeCustomer } from '../../lib/stripe';

const users = new UsersRepository();
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';

/** Unix seconds for 00:00 on the 1st of next month (UTC) — the billing anchor. */
function firstOfNextMonthUnix(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
}

/**
 * Start (or resume) a repairer's monthly subscription. Returns a Stripe Checkout
 * URL (subscription mode) that captures the card and creates the subscription:
 * £60/month billed upfront on the 1st; the partial first month is free (they
 * start now and the first charge lands on the 1st of next month).
 * The card-on-file + active subscription then gate job acceptance.
 */
async function subscribeHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const priceId = process.env['STRIPE_PRICE_ID'];
  if (!priceId) throw new ValidationError('Subscription price is not configured');

  const user = await users.getById(auth.userId);
  if (!user?.repairer) throw new NotFoundError('Repairer profile', auth.userId);
  if (user.repairer.subscriptionStatus === 'active' || user.repairer.subscriptionStatus === 'trialing') {
    throw new ValidationError('You already have an active subscription');
  }

  // A Customer is created at sign-up; backfill for accounts that predate that.
  let customerId = user.repairer.stripeCustomerId;
  if (!customerId) {
    customerId = await createStripeCustomer({
      email: user.email,
      name: user.repairer.businessName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      metadata: { userId: user.userId },
    });
    await users.update(user.userId, { repairer: { ...user.repairer, stripeCustomerId: customerId } });
    logger.info('Backfilled Stripe customer for repairer', { userId: user.userId, customerId });
  }

  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      // Bill £60 upfront on the 1st; the partial first month is free —
      // anchor to the 1st with no proration for the stub period.
      billing_cycle_anchor: firstOfNextMonthUnix(),
      proration_behavior: 'none',
      metadata: { userId: user.userId },
    },
    metadata: { userId: user.userId, type: 'subscription' },
    success_url: `${FRONTEND_URL}/billing?status=success`,
    cancel_url: `${FRONTEND_URL}/billing?status=cancelled`,
  });

  logger.info('Subscription checkout session created', { userId: user.userId, sessionId: session.id });
  return ok({ checkoutUrl: session.url });
}

export const handler = withErrorHandler(subscribeHandler);
