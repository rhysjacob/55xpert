import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Provider-agnostic email. Callers depend on the EmailSender interface, never
// on a concrete provider, so swapping SES for Postmark/Resend later is one new
// implementation + a factory switch — no caller changes. Nothing calls this
// directly from a request path: notifications are driven off EventBridge (see
// handlers/notifications/*), so a slow or failing send never blocks the app.
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/** @deprecated Prefer {@link EmailMessage}. */
export type EmailParams = EmailMessage;

/** A sendable email channel. Implement this to add a provider. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** SES-backed sender. The FROM identity must be verified in SES (out-of-band). */
class SesEmailSender implements EmailSender {
  private readonly ses = new SESClient({});
  constructor(private readonly from: string) {}

  async send(message: EmailMessage): Promise<void> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    await this.ses.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: to },
        Message: {
          Subject: { Data: message.subject },
          Body: {
            Html: { Data: message.htmlBody },
            ...(message.textBody ? { Text: { Data: message.textBody } } : {}),
          },
        },
      }),
    );
    logger.info('Email sent', { to, subject: message.subject });
  }
}

let sender: EmailSender | undefined;

/**
 * The configured email sender (SES today). Provider is chosen by EMAIL_PROVIDER
 * (default `ses`); the from address comes from FROM_EMAIL. Cached per container.
 */
export function getEmailSender(): EmailSender {
  if (sender) return sender;
  const from = process.env['FROM_EMAIL'] ?? 'noreply@corexpert.co.uk';
  const provider = process.env['EMAIL_PROVIDER'] ?? 'ses';
  switch (provider) {
    // Future: case 'postmark' / 'resend' → new PostmarkEmailSender(...) etc.
    case 'ses':
    default:
      sender = new SesEmailSender(from);
  }
  return sender;
}

/** Convenience: send one message via the configured sender. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  await getEmailSender().send(message);
}
