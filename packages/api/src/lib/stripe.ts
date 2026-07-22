import Stripe from 'stripe';
import { getSecret } from './secrets';

// ---------------------------------------------------------------------------
// Lazily-constructed Stripe client. The key never lives in code or env — only
// the Secrets Manager secret NAME is passed via STRIPE_SECRET_NAME, and the
// value (a JSON blob) is fetched + cached at runtime, mirroring lib/secrets.ts.
//
// Secret shape: { "secretKey": "sk_…", "webhookSecret": "whsec_…" }
// ---------------------------------------------------------------------------

interface StripeSecret {
  secretKey: string;
  webhookSecret: string;
}

const STRIPE_API_VERSION = '2025-02-24.acacia' as const;

let loaded: { stripe: Stripe; webhookSecret: string } | undefined;

async function load(): Promise<{ stripe: Stripe; webhookSecret: string }> {
  if (loaded) return loaded;

  const secretName = process.env['STRIPE_SECRET_NAME'];
  if (!secretName) {
    throw new Error('STRIPE_SECRET_NAME is not set — Stripe is not configured');
  }

  let parsed: StripeSecret;
  try {
    parsed = JSON.parse(await getSecret(secretName)) as StripeSecret;
  } catch {
    throw new Error(`Stripe secret ${secretName} is not valid JSON ({ secretKey, webhookSecret })`);
  }
  if (!parsed.secretKey) {
    throw new Error(`Stripe secret ${secretName} is missing "secretKey"`);
  }

  loaded = {
    stripe: new Stripe(parsed.secretKey, { apiVersion: STRIPE_API_VERSION }),
    webhookSecret: parsed.webhookSecret ?? '',
  };
  return loaded;
}

/** The shared Stripe client, constructed from the Secrets Manager secret. */
export async function getStripe(): Promise<Stripe> {
  return (await load()).stripe;
}

/** The webhook signing secret used to verify inbound Stripe events. */
export async function getStripeWebhookSecret(): Promise<string> {
  return (await load()).webhookSecret;
}
