import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { getAuthContext, requireRole } from '../../middleware/auth';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { ValidationError } from '@corexpert/core';
import { getWhatsAppSender } from '../../lib/whatsapp';

const schema = z.object({ to: z.string().regex(/^\+[0-9]{7,15}$/, 'E.164 number required, e.g. +447817351526') });

/**
 * Send a test WhatsApp message (TRX-61 go-live check). Admin-only. Verifies the
 * Twilio wiring end-to-end without waiting for a real job. On the sandbox the
 * recipient must have joined; in production `to` must be opted-in + in-window
 * or the template applies.
 */
async function whatsappTestHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const auth = getAuthContext(event);
  requireRole(auth, 'ADMIN');
  const { to } = parseBody(event, schema);

  const wa = getWhatsAppSender();
  if (!wa.configured) {
    throw new ValidationError('WhatsApp is not configured — set the Twilio credentials first');
  }
  await wa.send({
    to,
    parameters: ['2020 Nissan Qashqai', 'SK6', '£1,099', '£25'],
    body: 'Test alert from The Repair XChange — your WhatsApp job alerts are working. 🚗',
  });
  logger.info('WhatsApp test sent', { to });
  return ok({ configured: true, to });
}

export const handler = withErrorHandler(whatsappTestHandler);
