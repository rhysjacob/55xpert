import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { JobsRepository, PaymentsRepository } from '@corexpert/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@corexpert/core';
import type { Payment } from '@corexpert/core';

const STRIPE_SECRET_KEY = process.env['STRIPE_SECRET_KEY'] ?? '';
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
const jobs = new JobsRepository();
const payments = new PaymentsRepository();

const checkoutSchema = z.object({
  jobId: z.string().uuid(),
});

async function createCheckoutHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'REPAIRER');

  const { jobId } = parseBody(event, checkoutSchema);

  const job = await jobs.getById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  if (!job.acceptance || job.acceptance.repairerId !== auth.userId) {
    throw new ForbiddenError('You must accept the job before paying');
  }
  if (job.acceptance.paymentId) {
    throw new ValidationError('Payment has already been initiated for this job');
  }

  const paymentId = randomUUID();

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'gbp',
        unit_amount: job.introductionFee,
        product_data: {
          name: 'COREXPERT Introduction Fee',
          description: `Job ${jobId} - ${job.vehicleSummary?.make} ${job.vehicleSummary?.model}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      paymentId,
      jobId,
      repairerId: auth.userId,
    },
    success_url: `${FRONTEND_URL}/jobs/${jobId}/details?payment=success`,
    cancel_url: `${FRONTEND_URL}/jobs/${jobId}?payment=cancelled`,
  });

  // Create payment record
  const payment: Payment = {
    paymentId,
    jobId,
    repairerId: auth.userId,
    amount: job.introductionFee,
    currency: 'gbp',
    status: 'PENDING',
    stripeCheckoutSessionId: session.id,
    createdAt: new Date().toISOString(),
  };

  await payments.create(payment);

  logger.info('Stripe checkout session created', {
    paymentId,
    jobId,
    sessionId: session.id,
  });

  return ok({
    checkoutUrl: session.url,
    paymentId,
  });
}

export const handler = withErrorHandler(createCheckoutHandler);
