import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withErrorHandler } from '../../middleware/error-handler';
import { parseBody } from '../../middleware/validation';
import { ok } from '../../lib/response';
import { logger } from '../../lib/logger';
import { LeadsRepository } from '@corexpert/db';
import type { Lead } from '@corexpert/core';
import { sendEmail } from '../../lib/email';

const leads = new LeadsRepository();

const leadSchema = z.object({
  type: z.enum(['REGISTER_INTEREST', 'CONTACT']),
  name: z.string().max(160).optional(),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional(),
  organisation: z.string().max(200).optional(),
  data: z.record(z.unknown()).default({}),
  /** Honeypot — must be empty; bots fill it. Silently dropped if present. */
  _hp: z.string().max(0).optional(),
});

const LABELS: Record<string, string> = {
  REGISTER_INTEREST: 'Register interest',
  CONTACT: 'Contact form',
};

/**
 * Public lead-capture endpoint for the marketing forms (TRX-71). Stores the
 * submission and notifies the team by email (best-effort — a mail hiccup never
 * loses the lead, which is persisted first). No auth: it's a public form, so a
 * honeypot field guards against trivial bots.
 */
async function submitHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event, leadSchema);

  const lead: Lead = {
    leadId: randomUUID(),
    type: body.type,
    email: body.email,
    ...(body.name ? { name: body.name } : {}),
    ...(body.phone ? { phone: body.phone } : {}),
    ...(body.organisation ? { organisation: body.organisation } : {}),
    data: body.data ?? {},
    createdAt: new Date().toISOString(),
  };
  await leads.create(lead);

  // Notify the team (best-effort). Sends only once SES has a verified identity.
  const to = process.env['LEADS_EMAIL'];
  if (to) {
    const lines = [
      `New lead — ${LABELS[body.type] ?? body.type}`,
      body.name ? `Name: ${body.name}` : '',
      `Email: ${body.email}`,
      body.phone ? `Phone: ${body.phone}` : '',
      body.organisation ? `Organisation: ${body.organisation}` : '',
      '',
      'Details:',
      ...Object.entries(body.data ?? {}).map(([k, v]) => `  ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`),
    ].filter(Boolean);
    try {
      await sendEmail({
        to,
        subject: `New ${LABELS[body.type] ?? 'lead'} — ${body.name ?? body.email}`,
        htmlBody: `<pre style="font-family:Arial,sans-serif">${lines.join('\n')}</pre>`,
        textBody: lines.join('\n'),
      });
    } catch (err) {
      logger.error('Lead notification email failed', { leadId: lead.leadId, err: String(err) });
    }
  }

  logger.info('Lead captured', { leadId: lead.leadId, type: lead.type });
  return ok({ received: true });
}

export const handler = withErrorHandler(submitHandler);
