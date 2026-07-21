import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import {
  getPaymentGraceMinutes,
  setPaymentGraceMinutes,
  DEFAULT_PAYMENT_GRACE_MINUTES,
  MIN_PAYMENT_GRACE_MINUTES,
  MAX_PAYMENT_GRACE_MINUTES,
} from '../../lib/job-settings';

const updateSchema = z.object({
  paymentGraceMinutes: z
    .number()
    .int()
    .min(MIN_PAYMENT_GRACE_MINUTES)
    .max(MAX_PAYMENT_GRACE_MINUTES),
});

/**
 * Admin settings for the job marketplace. Currently just the payment grace
 * period — how long an accepted job may sit unpaid before the sweeper returns
 * it to the Xchange.
 */
async function jobSettingsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');

  const method = event.requestContext.http.method;

  if (method === 'GET') {
    return ok({
      paymentGraceMinutes: await getPaymentGraceMinutes(),
      defaultMinutes: DEFAULT_PAYMENT_GRACE_MINUTES,
      minMinutes: MIN_PAYMENT_GRACE_MINUTES,
      maxMinutes: MAX_PAYMENT_GRACE_MINUTES,
    });
  }

  // PUT — change the grace period. Takes effect on the next sweep, and applies
  // to already-accepted jobs since the deadline is derived at sweep time.
  const body = parseBody(event, updateSchema);
  await setPaymentGraceMinutes(body.paymentGraceMinutes);

  return ok({
    paymentGraceMinutes: await getPaymentGraceMinutes(),
    defaultMinutes: DEFAULT_PAYMENT_GRACE_MINUTES,
    minMinutes: MIN_PAYMENT_GRACE_MINUTES,
    maxMinutes: MAX_PAYMENT_GRACE_MINUTES,
  });
}

export const handler = withErrorHandler(jobSettingsHandler);
