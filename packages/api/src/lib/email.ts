import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from './logger';

const FROM_EMAIL = process.env['FROM_EMAIL'] ?? 'noreply@corexpert.co.uk';
const ses = new SESClient({});

export interface EmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/** Send an email via SES. */
export async function sendEmail(params: EmailParams): Promise<void> {
  const toAddresses = Array.isArray(params.to) ? params.to : [params.to];

  try {
    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: toAddresses,
      },
      Message: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: params.htmlBody },
          ...(params.textBody ? { Text: { Data: params.textBody } } : {}),
        },
      },
    }));

    logger.info('Email sent', {
      to: toAddresses,
      subject: params.subject,
    });
  } catch (error) {
    logger.error('Failed to send email', error, {
      to: toAddresses,
      subject: params.subject,
    });
    throw error;
  }
}
