import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

/**
 * Runtime job-marketplace settings, backed by SSM Parameter Store.
 *
 *  - `/corexpert/{stage}/jobs/payment-grace-minutes` — how long a repairer has
 *    to pay the introduction fee after accepting, before the job is released
 *    back to the Xchange.
 *
 * Reads fail safe: any SSM error or unparseable value falls back to the default
 * so the sweeper keeps a sane deadline rather than releasing everything.
 */

const STAGE = process.env['STAGE'] ?? 'dev';
export const PAYMENT_GRACE_PARAM = `/corexpert/${STAGE}/jobs/payment-grace-minutes`;

/** Used when SSM is unreachable or holds a bad value. */
export const DEFAULT_PAYMENT_GRACE_MINUTES = 30;

/** Guard rails for the admin-settable value. */
export const MIN_PAYMENT_GRACE_MINUTES = 5;
export const MAX_PAYMENT_GRACE_MINUTES = 10080; // 7 days

const ssm = new SSMClient({});

/** Read the payment grace period in minutes. Never throws. */
export async function getPaymentGraceMinutes(): Promise<number> {
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: PAYMENT_GRACE_PARAM }));
    const parsed = Number(res.Parameter?.Value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_PAYMENT_GRACE_MINUTES;
    }
    return parsed;
  } catch {
    return DEFAULT_PAYMENT_GRACE_MINUTES;
  }
}

/** Persist a new grace period (admin-only; caller must validate the range). */
export async function setPaymentGraceMinutes(minutes: number): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: PAYMENT_GRACE_PARAM,
      Value: String(minutes),
      Type: 'String',
      Overwrite: true,
    }),
  );
}
