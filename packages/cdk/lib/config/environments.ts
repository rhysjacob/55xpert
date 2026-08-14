export interface EnvironmentConfig {
  stage: string;
  region: string;
  removalPolicy: 'destroy' | 'retain';
  introductionFee: number; // pence
  confidenceThreshold: number;
  aiProvider: string;
  aiModelId: string;
  /** OneAutoAPI base URL (sandbox for dev, production for prod). */
  oneAutoBaseUrl: string;
  /** Active warranty ruleset id (see packages/core/src/schemes). */
  warrantyScheme: string;
  /** Default tenant id (TRX-77) that owns consumer + legacy cases. */
  defaultWarrantyCompanyId: string;
  /**
   * White-label consumer portals: brand id (as in the consumer app's
   * branding/brands.ts) -> the WarrantyCompany that owns cases submitted there.
   *
   * Each entry gets its own Cognito app client, named
   * `corexpert-{stage}-consumer-{brand}`. The tenant is resolved from that
   * client at signup and stamped onto the user, so it rides in the signed JWT
   * rather than being asserted by the browser — hostnames and Origin headers
   * can be forged, and the tenant decides which repairer network sees the job.
   */
  whiteLabelTenants: Record<string, string>;
  /**
   * Public base URL of the repairer app — Stripe checkout success/cancel
   * redirects return here (else they fall back to http://localhost:3001).
   */
  frontendUrl: string;
  /**
   * Browser origins allowed to upload to / read from the images bucket (S3
   * CORS, TRX-72). The three SPA CloudFront domains, plus localhost for local
   * dev. Replaces the previous wildcard '*'.
   */
  appOrigins: string[];
  /**
   * FROM address for outbound notification emails (TRX-60). Must be a verified
   * SES identity (domain or address) in this account/region, and SES must be
   * out of sandbox to email arbitrary recipients.
   */
  notificationsFromEmail: string;
  /** Internal inbox that receives new marketing-lead notifications (TRX-71). */
  leadsEmail: string;
  /** Internal inbox that receives repairer expert-query alerts (TRX-57). */
  expertQueueEmail: string;
  /** Admin SPA base URL, used in expert-query notification links (TRX-57). */
  adminUrl: string;
  /**
   * WhatsApp via Twilio (TRX-61). To keep credentials out of source, all Twilio
   * IDENTIFIERS live in a Secrets Manager secret (JSON: accountSid, apiKeySid,
   * from) referenced by NAME here, and the API-key SECRET in a second secret.
   * Blank → channel dormant. Injected into Lambdas via CloudFormation dynamic
   * references at deploy. See docs/whatsapp-feasibility.md.
   */
  twilioConfigSecretName: string;
  /** Secrets Manager secret NAME holding the Twilio API-key secret (plain string). */
  twilioAuthTokenSecretName: string;
  /** Approved WhatsApp template's Twilio Content SID (HX…). Blank → freeform (sandbox). */
  twilioWhatsAppTemplateSid: string;
  /**
   * Stripe EventBridge partner event source name (e.g.
   * `aws.partner/stripe.com/…`), created out-of-band in the Stripe dashboard.
   * Empty until configured; when set, the CDK associates it with an event bus
   * and routes Stripe events to the webhook processor Lambda.
   */
  stripeEventSourceName: string;
  /** Stripe Price id for the repairer monthly subscription (£60/mo). */
  stripePriceId: string;
}

export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  dev: {
    stage: 'dev',
    region: 'eu-west-2',
    removalPolicy: 'destroy',
    introductionFee: 2500, // £25
    confidenceThreshold: 0.7,
    aiProvider: 'bedrock-claude',
    aiModelId: 'eu.anthropic.claude-sonnet-4-6',
    // Dev uses sandbox: the live Experian AutoCheck subscription/key returns 403
    // until activated in the OneAutoAPI dashboard. Flip to api.oneautoapi.com then.
    oneAutoBaseUrl: 'https://sandbox.oneautoapi.com',
    warrantyScheme: 'company-2025',
    defaultWarrantyCompanyId: 'demotenant',
    whiteLabelTenants: {
      precision: '4496a9cb-01fa-436b-8dc9-c6553d61c8ad', // Precision Repair Group
    },
    // Repairer app CloudFront distribution (Corexpert-dev-Frontend output).
    frontendUrl: 'https://d1pyyy434cv4q3.cloudfront.net',
    appOrigins: [
      'https://d3azgpmicty14y.cloudfront.net', // consumer
      'https://d1tl5y9m0dbx9s.cloudfront.net', // consumer, precision white-label
      'https://d1pyyy434cv4q3.cloudfront.net', // repairer
      'https://d1pqg5zsx4s9wp.cloudfront.net', // admin
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    notificationsFromEmail: 'notify@d55.co.uk',
    leadsEmail: 'rhys.jacob@d55.co.uk',
    expertQueueEmail: 'rhys.jacob@d55.co.uk',
    adminUrl: 'https://d1pqg5zsx4s9wp.cloudfront.net',
    // Twilio WhatsApp — dormant until a Content template exists (this account
    // requires a template; freeform is blocked). Secrets are ready in Secrets
    // Manager (corexpert/dev/twilio-config + …/twilio-api-key-secret); to go
    // live, restore these names + set twilioWhatsAppTemplateSid, redeploy.
    twilioConfigSecretName: '',
    twilioAuthTokenSecretName: '',
    twilioWhatsAppTemplateSid: '',
    // Stripe (test-mode) EventBridge partner source — associated with an event
    // bus by the CDK; routes checkout events to the processor Lambda.
    stripeEventSourceName: 'aws.partner/stripe.com/ed_test_61V5Jcxbm7cBfrssA16V4ceY2fE9Q0op8oGOADAC8LDM',
    stripePriceId: 'price_1TvwJdPEDJHRNcKwY3zH4i7D',
  },
  prod: {
    stage: 'prod',
    region: 'eu-west-2',
    removalPolicy: 'retain',
    introductionFee: 2500,
    confidenceThreshold: 0.7,
    aiProvider: 'bedrock-claude',
    aiModelId: 'eu.anthropic.claude-sonnet-4-6',
    oneAutoBaseUrl: 'https://api.oneautoapi.com',
    warrantyScheme: 'company-2025',
    defaultWarrantyCompanyId: 'demotenant',
    // Empty until a white-label client goes live in production. Adding an entry
    // creates its app client; the tenant id must be a real WarrantyCompany.
    whiteLabelTenants: {},
    // Production repairer domain — Stripe checkout redirects here.
    // MUST be updated to the real custom domain before go-live.
    frontendUrl: process.env['PROD_FRONTEND_URL'] ?? '',
    // Production SPA domains. MUST be set before go-live — a deploy with an
    // empty list will reject all cross-origin requests (fail-closed).
    appOrigins: (process.env['PROD_APP_ORIGINS'] ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    notificationsFromEmail: 'notify@repairxchange.co.uk',
    leadsEmail: 'hello@repairxchange.co.uk',
    expertQueueEmail: 'experts@repairxchange.co.uk',
    adminUrl: 'https://admin.repairxchange.co.uk',
    twilioConfigSecretName: '',
    twilioAuthTokenSecretName: '',
    twilioWhatsAppTemplateSid: '',
    // Stripe live-mode partner event source + price. MUST be configured before
    // go-live or subscription/payment flows will be inert.
    stripeEventSourceName: process.env['PROD_STRIPE_EVENT_SOURCE'] ?? '',
    stripePriceId: process.env['PROD_STRIPE_PRICE_ID'] ?? '',
  },
};
