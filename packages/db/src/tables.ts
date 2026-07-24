const STAGE = process.env['STAGE'] ?? 'dev';

export const TABLES = {
  CASES: `corexpert-${STAGE}-cases`,
  JOBS: `corexpert-${STAGE}-jobs`,
  USERS: `corexpert-${STAGE}-users`,
  PAYMENTS: `corexpert-${STAGE}-payments`,
  CORRECTIONS: `corexpert-${STAGE}-corrections`,
  WARRANTY_COMPANIES: `corexpert-${STAGE}-warranty-companies`,
  ORGANISATIONS: `corexpert-${STAGE}-organisations`,
  NETWORK_LINKS: `corexpert-${STAGE}-network-links`,
} as const;

export const GSI = {
  // Cases table
  CASES_USER_CREATED: 'userId-createdAt-index',
  CASES_STATUS_CREATED: 'status-createdAt-index',

  // Jobs table
  JOBS_STATUS_PUBLISHED: 'status-publishedAt-index',
  JOBS_CASE: 'caseId-index',

  // Users table
  USERS_EMAIL: 'email-index',
  USERS_ROLE: 'role-createdAt-index',
  USERS_ORG: 'organisationId-index',

  // Network-links table (per-company repairer networks). Base table is keyed
  // by warrantyCompanyId (PK) + organisationId (SK) — a company's network is a
  // direct query; this GSI flips it to list an org's companies (matching).
  NETWORK_LINKS_ORG: 'organisationId-index',

  // Payments table
  PAYMENTS_STRIPE: 'stripePaymentIntentId-index',
  PAYMENTS_JOB: 'jobId-index',

  // Corrections table
  CORRECTIONS_CASE: 'caseId-createdAt-index',
} as const;
