import type { Job } from '@corexpert/core';
import type { EmailMessage } from './email';

const money = (pence: number): string => `£${Math.round(pence / 100)}`;

/**
 * The "a job matching your coverage is available" alert (TRX-60). Plain,
 * branded, and links straight to the available-jobs list — fastest-finger-first
 * means the CTA is time-sensitive.
 */
export function jobAlertEmail(job: Job, firstName?: string): Omit<EmailMessage, 'to'> {
  const v = job.vehicleSummary;
  const vehicle = [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'A vehicle';
  const area = job.location?.postcode ?? '';
  const jobsUrl = `${process.env['FRONTEND_URL'] ?? 'https://app.repairxchange.co.uk'}/jobs`;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  const subject = `New job matching your coverage — ${vehicle}${area ? ` (${area})` : ''}`;

  const textBody = [
    greeting,
    '',
    `A new job matching your coverage is available on The Repair XChange:`,
    `  Vehicle: ${vehicle}`,
    area ? `  Location: ${area}` : '',
    `  Indicative cost: ${money(job.indicativeCost)}`,
    `  Match fee (on accept): ${money(job.introductionFee)}`,
    '',
    `Jobs are first-come, first-served — open the XChange to accept:`,
    jobsUrl,
    '',
    'The Repair XChange',
  ].filter(Boolean).join('\n');

  const htmlBody = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <h2 style="color:#059669;margin:0 0 8px">Repair XChange</h2>
    <p>${greeting}</p>
    <p>A new job matching your coverage is available:</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td style="padding:4px 0"><strong>${vehicle}</strong></td></tr>
      ${area ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Location</td><td style="padding:4px 0">${area}</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Indicative cost</td><td style="padding:4px 0">${money(job.indicativeCost)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Match fee</td><td style="padding:4px 0">${money(job.introductionFee)} on accept</td></tr>
    </table>
    <p style="color:#6b7280;font-size:14px">Jobs are first-come, first-served.</p>
    <p><a href="${jobsUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">View &amp; accept the job</a></p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">You're receiving this because email alerts are on for your account. Manage this in your preferences.</p>
  </div>`;

  return { subject, htmlBody, textBody };
}
