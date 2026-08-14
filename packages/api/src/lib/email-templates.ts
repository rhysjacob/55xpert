import type { Case, Job, JobQuery } from '@corexpert/core';
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

/**
 * Internal alert to the Xpert team when a repairer raises a "refer to expert"
 * query on an accepted job (TRX-57). Links to the admin queries queue.
 */
export function expertQueryEmail(query: JobQuery): Omit<EmailMessage, 'to'> {
  const adminUrl = `${process.env['ADMIN_URL'] ?? process.env['FRONTEND_URL'] ?? ''}`.replace(/\/$/, '');
  const link = adminUrl ? `${adminUrl}/queries` : '';
  const subject = `Expert query — ${query.vehicle ?? 'job'} (${query.repairerName ?? 'repairer'})`;
  const textBody = [
    `A repairer has raised a question / referred a job to an expert.`,
    '',
    `Repairer: ${query.repairerName ?? query.repairerId}`,
    query.vehicle ? `Vehicle: ${query.vehicle}` : '',
    `Job: ${query.jobId}`,
    '',
    `Question:`,
    query.question,
    '',
    link ? `Respond in the admin queue: ${link}` : '',
    '',
    'The Repair XChange',
  ].filter(Boolean).join('\n');
  const htmlBody = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <h2 style="color:#4f46e5;margin:0 0 8px">Expert query</h2>
    <p>A repairer has raised a question / referred a job to an expert.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Repairer</td><td style="padding:4px 0"><strong>${query.repairerName ?? query.repairerId}</strong></td></tr>
      ${query.vehicle ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td style="padding:4px 0">${query.vehicle}</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Job</td><td style="padding:4px 0">${query.jobId}</td></tr>
    </table>
    <p style="color:#6b7280;margin:0 0 4px">Question</p>
    <blockquote style="margin:0;padding:10px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${query.question}</blockquote>
    ${link ? `<p style="margin-top:16px"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Respond in the queue</a></p>` : ''}
  </div>`;
  return { subject, htmlBody, textBody };
}

/** Notify a repairer that their expert query has been answered (TRX-57). */
export function expertQueryAnsweredEmail(query: JobQuery): Omit<EmailMessage, 'to'> {
  const appUrl = `${process.env['FRONTEND_URL'] ?? ''}`.replace(/\/$/, '');
  const link = appUrl ? `${appUrl}/jobs/${query.jobId}/details` : '';
  const subject = `An expert has replied — ${query.vehicle ?? 'your job'}`;
  const textBody = [
    `An expert has replied to your question on ${query.vehicle ?? 'your accepted job'}:`,
    '',
    query.response ?? '',
    '',
    link ? `View the job: ${link}` : '',
    '',
    'The Repair XChange',
  ].filter(Boolean).join('\n');
  const htmlBody = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <h2 style="color:#059669;margin:0 0 8px">An expert has replied</h2>
    <p>Regarding your question on <strong>${query.vehicle ?? 'your accepted job'}</strong>:</p>
    <blockquote style="margin:0;padding:10px 14px;background:#ecfdf5;border-radius:8px;white-space:pre-wrap">${query.response ?? ''}</blockquote>
    ${link ? `<p style="margin-top:16px"><a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">View the job</a></p>` : ''}
  </div>`;
  return { subject, htmlBody, textBody };
}

/**
 * A consumer has asked for a referred case to be allocated to one of the
 * warranty company's own sites (the damage is not doable as a mobile repair).
 * Addressed to whoever runs that company's allocation queue.
 */
export function siteAllocationRequestEmail(input: {
  caseData: Case;
  companyName?: string;
  consumerName?: string;
  consumerEmail?: string;
}): Omit<EmailMessage, 'to'> {
  const { caseData, companyName, consumerName, consumerEmail } = input;
  const adminUrl = `${process.env['ADMIN_URL'] ?? process.env['FRONTEND_URL'] ?? ''}`.replace(/\/$/, '');
  const link = adminUrl ? `${adminUrl}/cases/${caseData.caseId}` : '';
  const vehicle = [caseData.vehicle?.make, caseData.vehicle?.model, caseData.vehicle?.registrationNo]
    .filter(Boolean)
    .join(' ');
  const reasons = (caseData.triageResult?.eligibility?.reasons ?? [])
    .filter((r) => r.verdict === 'REFER')
    .map((r) => r.detail);

  const subject = `Site allocation requested — ${caseData.referenceNo}${vehicle ? ` (${vehicle})` : ''}`;
  const textBody = [
    `A customer has asked for this case to be allocated to a${companyName ? ` ${companyName}` : ''} site.`,
    'The assessment referred it, so it is not suitable for a mobile repair.',
    '',
    `Case: ${caseData.referenceNo}`,
    vehicle ? `Vehicle: ${vehicle}` : '',
    caseData.postcode ? `Customer postcode: ${caseData.postcode}` : '',
    consumerName || consumerEmail ? `Customer: ${[consumerName, consumerEmail].filter(Boolean).join(' — ')}` : '',
    '',
    reasons.length ? 'Why it was referred:' : '',
    ...reasons.map((r) => `- ${r}`),
    '',
    link ? `Open the case: ${link}` : '',
    '',
    'The Repair XChange',
  ].filter(Boolean).join('\n');

  const htmlBody = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <h2 style="color:#4f46e5;margin:0 0 8px">Site allocation requested</h2>
    <p>A customer has asked for this case to be allocated to a${companyName ? ` ${companyName}` : ''} site. The assessment referred it, so it is not suitable for a mobile repair.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Case</td><td style="padding:4px 0"><strong>${caseData.referenceNo}</strong></td></tr>
      ${vehicle ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td style="padding:4px 0">${vehicle}</td></tr>` : ''}
      ${caseData.postcode ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Customer postcode</td><td style="padding:4px 0">${caseData.postcode}</td></tr>` : ''}
      ${consumerEmail ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Customer</td><td style="padding:4px 0">${[consumerName, consumerEmail].filter(Boolean).join(' — ')}</td></tr>` : ''}
    </table>
    ${reasons.length ? `<p style="color:#6b7280;margin:0 0 4px">Why it was referred</p>
    <ul style="margin:0;padding-left:18px">${reasons.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
    ${link ? `<p style="margin-top:16px"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open the case</a></p>` : ''}
  </div>`;

  return { subject, htmlBody, textBody };
}
