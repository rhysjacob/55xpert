import Stripe from 'stripe';
import { getSecret } from './secrets';

// ---------------------------------------------------------------------------
// Lazily-constructed Stripe client. The key never lives in code or env — only
// the Secrets Manager secret NAME is passed via STRIPE_SECRET_NAME, and the
// value (a JSON blob) is fetched + cached at runtime, mirroring lib/secrets.ts.
//
// Secret shape: { "secretKey": "sk_…" }
// (No webhook signing secret is needed: inbound Stripe events arrive via the
// EventBridge partner source, which is authenticated by AWS, not by signature.)
// ---------------------------------------------------------------------------

interface StripeSecret {
  secretKey: string;
}

const STRIPE_API_VERSION = '2025-02-24.acacia' as const;

let loaded: Stripe | undefined;

/** The shared Stripe client, constructed from the Secrets Manager secret. */
export async function getStripe(): Promise<Stripe> {
  if (loaded) return loaded;

  const secretName = process.env['STRIPE_SECRET_NAME'];
  if (!secretName) {
    throw new Error('STRIPE_SECRET_NAME is not set — Stripe is not configured');
  }

  let parsed: StripeSecret;
  try {
    parsed = JSON.parse(await getSecret(secretName)) as StripeSecret;
  } catch {
    throw new Error(`Stripe secret ${secretName} is not valid JSON ({ secretKey })`);
  }
  if (!parsed.secretKey) {
    throw new Error(`Stripe secret ${secretName} is missing "secretKey"`);
  }

  loaded = new Stripe(parsed.secretKey, { apiVersion: STRIPE_API_VERSION });
  return loaded;
}

/**
 * Create a Stripe Billing Portal session — a fully Stripe-hosted page where the
 * repairer views invoices, updates their card, and cancels. Returns the URL to
 * redirect to. (Delegates invoice history / card update / cancellation to
 * Stripe; nothing to build our side.)
 */
export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

/**
 * Add a one-off charge (the match fee) as a pending invoice item on the
 * customer. It auto-attaches to their next monthly subscription invoice, so the
 * repairer pays subscription + accrued match fees in one monthly charge.
 * Returns the invoice item id.
 */
export async function createMatchFeeInvoiceItem(params: {
  customerId: string;
  amountPence: number;
  description: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = await getStripe();
  const item = await stripe.invoiceItems.create({
    customer: params.customerId,
    amount: params.amountPence,
    currency: 'gbp',
    description: params.description,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
  return item.id;
}

/**
 * Create a Stripe Customer — the anchor for a repairer's subscription, saved
 * card, and invoicing. Returns the new customer id.
 */
export async function createStripeCustomer(params: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = await getStripe();
  const customer = await stripe.customers.create({
    email: params.email,
    ...(params.name ? { name: params.name } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
  return customer.id;
}
