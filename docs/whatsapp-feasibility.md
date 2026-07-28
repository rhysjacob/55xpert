# WhatsApp Business — Feasibility & Decision (TRX-62)

Status: R&D / decision for review · Owner: Rhys · Relates to TRX-61 (alerts),
TRX-57 (refer-to-expert), TRX-68 (FAQ assistant).

## 1. Goal

Decide **how** COREXPERT / The Repair XChange sends and (later) receives
WhatsApp messages, so we can:

- send **job alerts** to a garage's primary contact as an *additional* channel
  alongside email (TRX-61 — "Should");
- route a **post-acceptance "question / refer to expert"** conversation
  (TRX-57 — "Must", the deliberate "get-out-of-jail" flow, fee still charged);
- later, mine the resulting **Q&A history** for an AI FAQ assistant (TRX-68).

This doc is the **gate**: it picks the integration route, the number strategy,
and the consent/template model, and lists exactly what Ops must action to get a
live sender. No production account exists yet — nothing here is blocked on code.

## 2. How WhatsApp business messaging actually works (the constraints)

These are Meta platform rules, not our choices — they shape everything below.

1. **You need a WhatsApp Business Account (WABA)** under a Meta Business
   Portfolio, plus **business verification** for anything beyond the lowest
   sending tier.
2. **A dedicated phone number** owned by us, that can receive an SMS **or** voice
   verification code. Critically: **a number already active on the consumer
   WhatsApp or WhatsApp Business *app* cannot be used** on the API until it's
   deleted from that app. So this must be a *fresh/dedicated* number, not
   anyone's personal mobile.
3. **Business-initiated messages require a pre-approved template.** We can only
   send free-form text inside a **24-hour customer-service window** that opens
   when the *user* messages us. A job alert is business-initiated → it **must**
   be a Meta-approved **template** (category: *Utility*). Template approval is
   usually minutes to a few hours.
4. **Opt-in is mandatory.** We must capture the recipient's consent to be
   messaged on WhatsApp, and honour STOP/opt-out.
5. **Pricing is per message/conversation**, billed by Meta by template category
   (Utility / Marketing / Authentication); user-initiated *service* messages are
   currently free. Meta's pricing model has changed more than once — **confirm
   current UK Utility rates at build time**. Budget a few pence per alert.

## 3. Decision 1 — Integration route: direct Cloud API vs a BSP

| | **Meta Cloud API (direct)** | **BSP** (Twilio / 360dialog / Sinch / Vonage) |
|---|---|---|
| Hosting | Meta-hosted, free | BSP-hosted |
| Onboarding | Embedded Signup or manual Business-Manager setup; we verify the number + submit templates | BSP wizard provisions number, templates, verification — fastest to live |
| Per-message cost | Meta's rate only (no markup) | Meta rate **+ BSP markup** (Twilio) or **flat monthly, no per-msg markup** (360dialog) |
| Inbound / agent inbox | We build webhook handling ourselves | Managed inbox UIs, routing, helpers |
| Fit with our stack | **Excellent** — we already have Lambda + API Gateway + EventBridge + Secrets Manager; outbound templates are a couple of REST calls | Adds a third-party dependency + its own auth/webhook model |
| Support / hand-holding | Self-serve | Real support, useful for first-time WABA setup |

**Decision (updated): use Twilio (BSP)**, behind our `WhatsAppSender` abstraction.

We initially recommended the direct Meta Cloud API, but chose **Twilio** for
faster, hand-held onboarding — Twilio provisions the WhatsApp number, drives
template submission/approval, and lets us validate the whole pipeline on its
**sandbox** before the production number/template are live. The trade-off is a
small per-message markup over Meta's raw rate, which is acceptable for the
alert volume.

- Phase-1 need (TRX-61) is *outbound Utility templates* — Twilio's Content API
  is one REST call (`POST /Accounts/{sid}/Messages.json` with `ContentSid` +
  `ContentVariables`). We already have Lambda + EventBridge + Secrets Manager.
- **Kept swappable.** The `WhatsAppSender` interface (mirroring `EmailSender`
  from TRX-60) means we can move to the direct Cloud API or another BSP later
  **without touching callers**. The direct Cloud API implementation was
  deprecated in favour of Twilio (recoverable from git history if ever needed).
- **Sandbox first:** Twilio's WhatsApp sandbox lets us test end-to-end (join by
  texting a code) before the number/template are approved.

## 4. Decision 2 — The phone number (the "eSIM" question)

- We need **one dedicated number** as the WABA sender. It does **not** have to be
  a physical SIM — options:
  - **eSIM / mobile number** (e.g. a data-only eSIM plan that can still receive
    an SMS or voice code) — works if it can receive the verification code.
  - **VoIP / virtual number** (Twilio number, landline) — works via **voice**
    verification; note *some* VoIP numbers are rejected for SMS, so pick one that
    supports voice OTP.
  - A spare company mobile number that is **not** on anyone's personal WhatsApp.
- **Do not** use a partner's or staff member's personal mobile — once it's on the
  API it can't be used in the normal WhatsApp app, and vice-versa.
- **Recommendation:** provision a **dedicated eSIM or VoIP number** owned by the
  company, reserved solely for the platform. One number for the whole platform is
  sufficient for phase 1 (all garages receive from the same COREXPERT sender).

## 5. Decision 3 — "Multiple users per garage"

WhatsApp's model is **one WABA number (us) ↔ many recipient numbers (them)**.

- **Outbound (TRX-61):** trivial — a garage/org can have several member contacts;
  we send the alert template to **each opted-in member's** number. This is just
  "iterate the org's contacts", no WhatsApp-side config needed. We already model
  multi-user orgs (primary contact + members).
- **Inbound (TRX-57 / TRX-68):** every garage's replies arrive at our **single**
  number's webhook. We must **correlate the sender's phone → org + user + job**
  and thread the conversation. Two ways to handle it:
  1. **Programmatic (Cloud API):** our webhook looks up the phone number against
     our user/org records and attaches the message to the right job/query.
  2. **BSP inbox:** a hosted agent inbox with assignment/routing if humans need to
     reply manually at volume.
- **Recommendation:** phase 1 is outbound-only (no inbound complexity). For
  TRX-57, start with programmatic correlation (we own the phone↔user mapping);
  adopt a BSP inbox only if manual reply volume justifies it. Capture each
  member's WhatsApp number + opt-in at onboarding so the mapping exists.

## 6. Architecture fit (how it slots into what we already have)

We built email notifications (TRX-60) the right way for this: **EventBridge
producers → a notifier consumer → a provider-abstracted sender**, config-gated,
secrets in Secrets Manager, SES currently dormant in sandbox. WhatsApp is the
**same shape**:

- A `WhatsAppSender` interface + `CloudApiWhatsAppSender` implementation
  (`POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages` with a
  template payload), mirroring `EmailSender` / `SesEmailSender`.
- Wire it into the existing **`job.published` EventBridge consumer** next to the
  email send, so a matched job fans out to email **and** WhatsApp for opted-in
  contacts.
- **Config-gated**: no-op unless `WHATSAPP_PHONE_NUMBER_ID` + token are set — so
  the code ships and sits dormant (exactly like SES sandbox) until Ops finishes
  §8. Token/secret in **Secrets Manager**, never in env/plaintext.
- Inbound (TRX-57/68) later: a small **webhook** Lambda (verify Meta signature →
  map sender → attach to job/query → emit a domain event).

Net: **TRX-61 is a small, self-contained build** on top of existing seams; the
only true blocker is the account/number/template (this doc's §8).

## 7. Consent, security & compliance

- **Opt-in capture** at repairer onboarding: an explicit "message me job alerts
  on WhatsApp" checkbox + the WhatsApp number; store consent + timestamp.
- **Opt-out**: honour STOP / a portal toggle; suppress sends when withdrawn.
- **PII**: phone numbers are personal data — store minimally, encrypted at rest
  (DynamoDB default), access-scoped; include WhatsApp in the privacy notice.
- **Least privilege**: the API token lives in Secrets Manager; only the notifier
  + webhook Lambdas can read it.
- **Number hygiene**: the sender number is company-owned and dedicated; protect
  the Meta Business Portfolio with 2FA + limited admins.

## 8. What Ops must action to go live (the actual blockers)

TRX-61 is built and dormant (Twilio sender). To **send a real message** via
Twilio, Ops needs:

1. A **Twilio account** — sign up at https://www.twilio.com/try-twilio.
2. **WhatsApp on Twilio** — request access / register a WhatsApp sender:
   https://www.twilio.com/en-us/messaging/channels/whatsapp. Twilio guides the
   WABA + number + business verification. (Test immediately meanwhile on the
   **WhatsApp Sandbox**: Console → Messaging → Try it out → Send a WhatsApp
   message.)
3. A **WhatsApp sender number** (Twilio provisions/registers it; not a number on
   personal WhatsApp).
4. The **Account SID** (public id) + an **Auth Token** — the token stored in
   **Secrets Manager**, injected as `TWILIO_AUTH_TOKEN` at go-live.
5. An **approved Utility template** for the job alert — its **Content SID** (HX…).
   We'll draft the copy; Ops creates/submits it in the Twilio Content Template
   Builder.

Hand us the **Account SID**, **WhatsApp sender number**, **template Content SID**
(safe to share), and confirm the **Auth Token is in Secrets Manager** → the
dormant channel goes live with a config flip (set `twilioAccountSid` /
`twilioWhatsAppFrom` / `twilioWhatsAppTemplateSid`, wire the token, redeploy).

## 9. Recommendation summary & phasing

- **Route:** **Twilio (BSP)**, behind a swappable `WhatsAppSender` abstraction
  (the direct Cloud API impl was deprecated; recoverable from git if needed). ✅
- **Number:** a **Twilio-provisioned WhatsApp sender number**, reserved for the
  platform. ✅
- **Multi-user:** outbound to each opted-in member; inbound correlated by phone
  → user/org; BSP inbox only if manual volume demands. ✅
- **Consent/templates:** opt-in at onboarding, Utility template for alerts,
  STOP handling. ✅

**Phasing:**
1. **TRX-61** — build the config-gated Cloud-API `WhatsAppSender` on the existing
   EventBridge/notification abstraction; opt-in capture at onboarding. *(Small,
   buildable now; live send gated on §8.)*
2. **TRX-57** — post-acceptance "raise a question / refer to expert" mechanism;
   record the query + notify via the abstraction (email now, WhatsApp once live);
   add the inbound webhook + phone→user mapping. *(Must.)*
3. **TRX-68** — once real WhatsApp Q&A history exists, build the AI FAQ assistant
   from it. *(Could; naturally last.)*
