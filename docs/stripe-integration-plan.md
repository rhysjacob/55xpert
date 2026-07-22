# Stripe Integration — Plan

Status: draft for review · Author: Claude Code · Sandbox keys to be supplied.

## 1. The board says this is bigger than "wire up the match fee"

My TRX-73 assumed Stripe = the per-job match fee (which is what the current code
does). Reading the board, the real commercial model is a **subscription + fees**
business, and Stripe underpins all of it:

| Ticket | System | MoSCoW | What it needs from Stripe |
|---|---|---|---|
| **TRX-50** | Repairer Portal | Must | Card payment **at sign-up** (card only for MVP1) |
| **TRX-44** | Website | Must | Repairer sign-up funnel incl. **payment details** + T&Cs |
| **TRX-73** | Repairer Portal | — | Match/introduction fee per job (current code) |
| **TRX-33** | Admin Portal | Must | **Billing engine**: pro-rata subscription + **monthly** job fees, invoiced via Stripe |
| **TRX-35** | Admin Portal | Should | Failed/retried payment handling + follow-up |
| **TRX-65** | Repairer Portal | Should | View/download invoices (Stripe-hosted PDFs) |
| **TRX-66** | Repairer Portal | Should | Self-service card update (Stripe-hosted form) |
| TRX-51 | Repairer Portal | Won't | Direct debit / GoCardless — deferred |

The marketing site already states the model: **£2/day subscription** + a **match
fee** that replaces commissions.

## 2. Commercial model — DECIDED (Jon): monthly billing

**Option B — subscription + accrue-and-invoice-monthly.** Each match fee becomes
a Stripe **invoice item** on the repairer's Customer; a monthly invoice
consolidates the subscription + accrued job fees and charges the saved card
once. Stripe generates the invoice/PDF (covers TRX-65 for free).

### Consequence: this supersedes the per-job payment flow built earlier
The interim per-job Checkout flow — and the machinery around it — was for the
rejected Option A and must be **removed/reworked**:
- **`create-checkout` per job** → replaced by a Stripe **invoice item** on the
  Customer at acceptance (no per-job Checkout session).
- **`PAYMENT_REQUIRED` gate on job details** → acceptance grants access
  immediately; the fee accrues to the monthly invoice. (Confirm: acceptance
  instead requires an **active subscription / card on file**.)
- **Unpaid-acceptance sweeper** (releases jobs not paid within a grace window)
  → obsolete; non-payment is handled at the **monthly invoice** level (failed
  invoice → suspend, TRX-35), not per job.
- EventBridge rule moves from `checkout.session.*` to `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.*`.

## 3. Foundation (needed for every option)

The data model already anticipates this — `RepairerProfile.stripeCustomerId`
exists (unused), and `Payment` carries `stripeCheckoutSessionId` /
`stripePaymentIntentId`. What's missing:

1. **Secrets** — `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Secrets
   Manager, granted to the checkout/webhook Lambdas, injected into the API stack
   env. (Today they're read from env but wired nowhere — the SDK inits with an
   empty key.) Sandbox keys go **only** into Secrets Manager, never into git.
2. **Stripe Customer per repairer** — create a Customer at sign-up and store
   `stripeCustomerId` on the profile. This is the anchor for subscription, saved
   card, invoicing, card-update, and invoice history. Nothing works without it.
3. **Events via EventBridge** — inbound Stripe events arrive on the **Amazon
   EventBridge partner event source**, not an HTTP webhook. No public endpoint,
   no signing secret to manage, and EventBridge gives retries/DLQ + fan-out
   (which the billing phases will want). Set up the EventBridge destination in
   the Stripe dashboard, then the CDK associates the partner source with an
   event bus and routes events to the processor Lambda. Each phase adds the
   event types it needs to the rule.
4. **`FRONTEND_URL`** — reinstate the redirect config (reverted earlier) so
   Checkout/hosted pages return to the repairer app, not localhost.

## 4. Architecture

- **Customer**: one Stripe Customer per repairer (`stripeCustomerId`).
- **Card capture at sign-up (TRX-50/44)**: Stripe Checkout in `setup` mode (or a
  Payment Element) to save a card to the Customer — no charge yet; card-only for
  MVP1.
- **Subscription (£2/day → billed monthly)**: a Stripe **Subscription** on a
  recurring Price. Pro-rata handled by Stripe on start/change (TRX-33).
- **Match fee per job**:
  - Option B: `stripe.invoiceItems.create({customer, amount})` at acceptance →
    rolled into the next monthly invoice.
  - Option A (interim): the existing Checkout session.
- **Invoices (TRX-65)**: list the Customer's Stripe invoices; link the hosted
  PDF. Little custom UI.
- **Card update (TRX-66)**: a Stripe **Billing Portal** session — Stripe hosts
  the whole card-management page; we just redirect.
- **State**: the EventBridge event stream is the source of truth — `checkout.session.completed`,
  `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`,
  `setup_intent.succeeded`. Update our `payments`/subscription records from
  these, never from the client.

## 5. Phased plan (mapped to tickets)

- **Phase 0 — Foundation.** Secrets Manager wiring, `FRONTEND_URL`, Stripe
  Customer at sign-up (`stripeCustomerId`), webhook signing secret + dashboard
  registration. Deploy to dev with the sandbox keys. *Unblocks everything.*
- **Phase 1 — Prove the pipe (TRX-73).** Get the existing match-fee Checkout
  working end-to-end in sandbox (accept → pay → details unlock; expiry releases
  the job). Validates secrets + webhook + the accept/pay/gate flow already built.
- **Phase 2 — Card at sign-up (TRX-50/44).** Setup-mode card capture in the
  repairer sign-up funnel; save card to the Customer; T&Cs.
- **Phase 3 — Subscription + billing engine (TRX-33).** Recurring subscription;
  match fees as invoice items; monthly consolidated invoice; pro-rata. *Needs
  the §2 commercial decision first.* Likely retires Phase-1 per-job Checkout.
- **Phase 4 — Ops.** Failed/retried payments + follow-up (TRX-35); invoice
  history (TRX-65); Billing-Portal card update (TRX-66).

## 6. Testing (sandbox)

- Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 9995`
  (declined), 3DS test cards for SCA.
- **Events**: create the EventBridge destination in the sandbox dashboard
  (region eu-west-2), drive a real Checkout in test mode, and assert the
  processor Lambda fired and our records updated. The dashboard's "send test
  event" puts an event straight on the partner bus.
- Confirm delivery robustness via the EventBridge rule's DLQ/retry.

## 7. Handling the sandbox keys (how to get them to me safely)

Don't paste secret keys into chat or commit them. Preferred: you create the
secret and I wire the code to read it —
`aws secretsmanager create-secret --name corexpert/dev/stripe --secret-string '{"secretKey":"sk_test_…"}'` (no webhook signing secret needed — events come via EventBridge)
— or I create an empty secret in the CDK and you fill the value in the console.
The publishable key (`pk_test_…`) is not sensitive and can go in the frontend env.

## 8. Open decisions
1. **Commercial model** (§2): per-job immediate (A) vs monthly consolidated (B).
   Gates Phase 1 vs 3 and the fee mechanism. → Jon.
2. Subscription cadence: £2/day billed monthly? annual option?
3. Does match-fee accrual pause/refund if a job is later cancelled?
4. One Stripe account for all warranty companies, or Stripe Connect per tenant?
   (Ties into multi-tenancy TRX-74 — likely one account for MVP.)
