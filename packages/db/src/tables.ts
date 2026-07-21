const STAGE = process.env['STAGE'] ?? 'dev';

export const TABLES = {
  CASES: `corexpert-${STAGE}-cases`,
  JOBS: `corexpert-${STAGE}-jobs`,
  USERS: `corexpert-${STAGE}-users`,
  PAYMENTS: `corexpert-${STAGE}-payments`,
  CORRECTIONS: `corexpert-${STAGE}-corrections`,
  WARRANTY_COMPANIES: `corexpert-${STAGE}-warranty-companies`,
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

  // Payments table
  PAYMENTS_STRIPE: 'stripePaymentIntentId-index',
  PAYMENTS_JOB: 'jobId-index',

  // Corrections table
  CORRECTIONS_CASE: 'caseId-createdAt-index',
} as const;
