import { logger } from './logger';
import type { Job } from '@corexpert/core';

// ---------------------------------------------------------------------------
// Provider-agnostic WhatsApp (TRX-61), mirroring the EmailSender abstraction.
// Callers depend on the WhatsAppSender interface, never a concrete provider, so
// a BSP (Twilio/360dialog) could replace the direct Cloud API later with no
// caller changes (see docs/whatsapp-feasibility.md).
//
// SHIPS DORMANT: until WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN are set
// (the token belongs in Secrets Manager, injected at deploy), getWhatsAppSender()
// returns a no-op that logs and skips — exactly like SES sitting in sandbox.
// Nothing calls this from a request path: sends are driven off EventBridge.
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  /** Recipient in E.164, e.g. +447700900123. */
  to: string;
  /** Approved Meta template name (business-initiated messages require a template). */
  templateName: string;
  /** Ordered body parameters filling the template's {{1}},{{2}},… placeholders. */
  parameters: string[];
  /** BCP-47 language code the template was approved in (default en_GB). */
  languageCode?: string;
}

export interface WhatsAppSender {
  /** True when real credentials are configured; false for the dormant no-op. */
  readonly configured: boolean;
  send(message: WhatsAppMessage): Promise<void>;
}

/** Direct Meta Cloud API sender: POST /{phoneNumberId}/messages. */
class CloudApiWhatsAppSender implements WhatsAppSender {
  readonly configured = true;
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiVersion: string,
  ) {}

  async send(message: WhatsAppMessage): Promise<void> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: message.to,
      type: 'template',
      template: {
        name: message.templateName,
        language: { code: message.languageCode ?? 'en_GB' },
        components: message.parameters.length
          ? [{ type: 'body', parameters: message.parameters.map((text) => ({ type: 'text', text })) }]
          : [],
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    logger.info('WhatsApp message sent', { to: message.to, template: message.templateName });
  }
}

/** Dormant sender — no credentials configured. Logs and skips; never throws. */
class NoopWhatsAppSender implements WhatsAppSender {
  readonly configured = false;
  async send(message: WhatsAppMessage): Promise<void> {
    logger.info('WhatsApp not configured — skipping send', { to: message.to, template: message.templateName });
  }
}

let sender: WhatsAppSender | undefined;

/**
 * The configured WhatsApp sender. Reads WHATSAPP_PHONE_NUMBER_ID +
 * WHATSAPP_ACCESS_TOKEN (the token should be sourced from Secrets Manager);
 * returns the dormant no-op until both are present. Cached per container.
 */
export function getWhatsAppSender(): WhatsAppSender {
  if (sender) return sender;
  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const apiVersion = process.env['WHATSAPP_API_VERSION'] ?? 'v20.0';
  sender = phoneNumberId && accessToken
    ? new CloudApiWhatsAppSender(phoneNumberId, accessToken, apiVersion)
    : new NoopWhatsAppSender();
  return sender;
}

const money = (pence: number): string => `£${Math.round(pence / 100)}`;

/**
 * Map a job to the approved job-alert template (TRX-61). The template name comes
 * from WHATSAPP_ALERT_TEMPLATE; the body parameters are ordered to match the
 * template Meta approves — DRAFT copy for that template:
 *
 *   "New job on The Repair XChange: {{1}} in {{2}}. Indicative {{3}}, match fee
 *    {{4}} on accept. Jobs are first-come, first-served — open the app to accept."
 *
 * Params: 1=vehicle, 2=location, 3=indicative cost, 4=match fee.
 */
export function jobAlertWhatsApp(job: Job, to: string): WhatsAppMessage {
  const v = job.vehicleSummary;
  const vehicle = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'A vehicle';
  const location = job.location?.postcode ?? 'your area';
  return {
    to,
    templateName: process.env['WHATSAPP_ALERT_TEMPLATE'] ?? 'job_alert',
    parameters: [vehicle, location, money(job.indicativeCost), money(job.introductionFee)],
  };
}
