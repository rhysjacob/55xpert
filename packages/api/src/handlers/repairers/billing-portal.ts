import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { ok } from '../../lib/response';
import { UsersRepository } from '@corexpert/db';
import { ValidationError } from '@corexpert/core';
import { createBillingPortalSession } from '../../lib/stripe';

const users = new UsersRepository();
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';

/**
 * Return a Stripe Billing Portal URL for the repairer to manage their
 * subscription — view invoices, update card, cancel. All Stripe-hosted.
 */
async function billingPortalHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const user = await users.getById(auth.userId);
  const customerId = user?.repairer?.stripeCustomerId;
  if (!customerId) {
    throw new ValidationError('No billing account yet — subscribe first');
  }

  const url = await createBillingPortalSession({
    customerId,
    returnUrl: `${FRONTEND_URL}/billing`,
  });
  return ok({ url });
}

export const handler = withErrorHandler(billingPortalHandler);
