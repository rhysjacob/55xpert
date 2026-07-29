import { logger } from './logger';
import type { Job } from '@corexpert/core';

// ---------------------------------------------------------------------------
// Provider-agnostic WhatsApp (TRX-61), mirroring the EmailSender abstraction.
// Callers depend on the WhatsAppSender interface, never a concrete provider.
// We send via TWILIO (BSP) — Twilio provisions the WhatsApp number, templates
// and approval, which is simpler to onboard than the direct Meta Cloud API
// (see docs/whatsapp-feasibility.md). The interface means another provider
// (e.g. direct Cloud API or 360dialog) can be swapped in with no caller changes.
//
// SHIPS DORMANT: until the Twilio credentials + sender + template are set (the
// auth token from Secrets Manager), getWhatsAppSender() returns a no-op that
// logs and skips — exactly like SES sitting in sandbox. Nothing calls this from
// a request path: sends are driven off EventBridge.
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  /** Recipient in E.164, e.g. +447700900123. */
  to: string;
  /**
   * Ordered body variables that fill the approved template's {{1}},{{2}},…
   * placeholders. Used when a template (Twilio Content SID) is configured —
   * required for business-initiated messages in production.
   */
  parameters: string[];
  /**
   * Fully-rendered plain text, used as a freeform fallback when NO template is
   * configured (e.g. the Twilio sandbox, or inside the 24-hour customer-service
   * window). Production alerts go via the template, not this.
   */
  body: string;
}

export interface WhatsAppSender {
  /** True when real credentials are configured; false for the dormant no-op. */
  readonly configured: boolean;
  send(message: WhatsAppMessage): Promise<void>;
}

/**
 * Twilio-backed sender. Sends an approved WhatsApp template via the Twilio
 * Content API: POST /Accounts/{sid}/Messages.json with ContentSid +
 * ContentVariables. Numbers are prefixed `whatsapp:` per Twilio's channel.
 */
class TwilioWhatsAppSender implements WhatsAppSender {
  readonly configured = true;
  constructor(
    private readonly accountSid: string,
    /** Basic-auth password: an API Key secret (preferred) or the account Auth Token. */
    private readonly authSecret: string,
    private readonly fromNumber: string,
    /** Approved template Content SID (HX…). Empty → send freeform `body`. */
    private readonly templateSid: string,
    /** API Key SID (SK…) used as the auth username; falls back to the account SID. */
    private readonly apiKeySid?: string,
  ) {}

  async send(message: WhatsAppMessage): Promise<void> {
    // URL is always keyed on the ACCOUNT SID; auth is the API Key (SK…) when set,
    // else the account SID — paired with the secret (API Key secret / Auth Token).
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const params: Record<string, string> = {
      To: `whatsapp:${message.to}`,
      From: `whatsapp:${this.fromNumber}`,
    };
    if (this.templateSid) {
      // Template path (production): ContentVariables maps the numbered placeholders.
      params['ContentSid'] = this.templateSid;
      params['ContentVariables'] = JSON.stringify(Object.fromEntries(message.parameters.map((v, i) => [String(i + 1), v])));
    } else {
      // Freeform path (sandbox / within the 24h window): plain body text.
      params['Body'] = message.body;
    }
    const auth = Buffer.from(`${this.apiKeySid || this.accountSid}:${this.authSecret}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    logger.info('WhatsApp message sent (Twilio)', { to: message.to, mode: this.templateSid ? 'template' : 'freeform' });
  }
}

/** Dormant sender — no credentials configured. Logs and skips; never throws. */
class NoopWhatsAppSender implements WhatsAppSender {
  readonly configured = false;
  async send(message: WhatsAppMessage): Promise<void> {
    logger.info('WhatsApp not configured — skipping send', { to: message.to });
  }
}

let sender: WhatsAppSender | undefined;

/**
 * The configured WhatsApp sender. Reads the Twilio config — TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN (from Secrets Manager), TWILIO_WHATSAPP_FROM (the WhatsApp
 * sender number) and TWILIO_WHATSAPP_TEMPLATE_SID (the approved template's
 * Content SID). Returns the dormant no-op until all are present. Cached per
 * container.
 */
export function getWhatsAppSender(): WhatsAppSender {
  if (sender) return sender;
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  // The Basic-auth secret: an API Key secret (preferred) or the account Auth Token.
  const authSecret = process.env['TWILIO_AUTH_TOKEN'];
  const apiKeySid = process.env['TWILIO_API_KEY_SID'] || undefined;
  const fromNumber = process.env['TWILIO_WHATSAPP_FROM'];
  // Template SID is OPTIONAL: with it we send an approved template (required in
  // production); without it we send freeform (the sandbox / 24h window).
  const templateSid = process.env['TWILIO_WHATSAPP_TEMPLATE_SID'] ?? '';
  sender = accountSid && authSecret && fromNumber
    ? new TwilioWhatsAppSender(accountSid, authSecret, fromNumber, templateSid, apiKeySid)
    : new NoopWhatsAppSender();
  return sender;
}

const money = (pence: number): string => `£${Math.round(pence / 100)}`;

/**
 * Map a job to the approved job-alert template's ordered variables (TRX-61).
 * The template is configured on the sender (Twilio Content SID). DRAFT copy for
 * Meta/Twilio approval:
 *
 *   "New job on The Repair XChange: {{1}} in {{2}}. Indicative {{3}}, match fee
 *    {{4}} on accept. Jobs are first-come, first-served — open the app to accept."
 *
 * Variables: 1=vehicle, 2=location, 3=indicative cost, 4=match fee.
 */
export function jobAlertWhatsApp(job: Job, to: string): WhatsAppMessage {
  const v = job.vehicleSummary;
  const vehicle = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'A vehicle';
  const location = job.location?.postcode ?? 'your area';
  const cost = money(job.indicativeCost);
  const fee = money(job.introductionFee);
  return {
    to,
    parameters: [vehicle, location, cost, fee],
    body: `New job on The Repair XChange: ${vehicle} in ${location}. Indicative ${cost}, match fee ${fee} on accept. Jobs are first-come, first-served — open the app to accept.`,
  };
}
