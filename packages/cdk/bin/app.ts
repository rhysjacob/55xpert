#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { ENVIRONMENTS } from '../lib/config/environments';

const app = new cdk.App();

const stage = app.node.tryGetContext('env') ?? 'dev';
const config = ENVIRONMENTS[stage];
if (!config) {
  throw new Error(`Unknown environment: ${stage}. Valid: ${Object.keys(ENVIRONMENTS).join(', ')}`);
}

// Guard: prod deploys must have critical config populated — fail early with a
// clear message rather than deploying with broken CORS / empty Stripe config.
if (config.stage === 'prod') {
  const missing: string[] = [];
  if (!config.frontendUrl) missing.push('PROD_FRONTEND_URL');
  if (config.appOrigins.length === 0) missing.push('PROD_APP_ORIGINS');
  if (!config.stripePriceId) missing.push('PROD_STRIPE_PRICE_ID');
  if (missing.length > 0) {
    throw new Error(
      `Production deploy requires these env vars: ${missing.join(', ')}. ` +
        'Set them before running cdk deploy --context env=prod.',
    );
  }
}

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: config.region,
};

const prefix = `Corexpert-${config.stage}`;

const databaseStack = new DatabaseStack(app, `${prefix}-Database`, { env, config });
const authStack = new AuthStack(app, `${prefix}-Auth`, {
  env,
  config,
  usersTable: databaseStack.usersTable,
  organisationsTable: databaseStack.organisationsTable,
});
const storageStack = new StorageStack(app, `${prefix}-Storage`, { env, config });

new ApiStack(app, `${prefix}-Api`, {
  env,
  config,
  userPool: authStack.userPool,
  userPoolClientIds: [
    authStack.consumerClient.userPoolClientId,
    authStack.repairerClient.userPoolClientId,
    authStack.adminClient.userPoolClientId,
  ],
  casesTable: databaseStack.casesTable,
  jobsTable: databaseStack.jobsTable,
  usersTable: databaseStack.usersTable,
  paymentsTable: databaseStack.paymentsTable,
  correctionsTable: databaseStack.correctionsTable,
  warrantyCompaniesTable: databaseStack.warrantyCompaniesTable,
  organisationsTable: databaseStack.organisationsTable,
  networkLinksTable: databaseStack.networkLinksTable,
  ingestionsTable: databaseStack.ingestionsTable,
  leadsTable: databaseStack.leadsTable,
  complaintsTable: databaseStack.complaintsTable,
  jobQueriesTable: databaseStack.jobQueriesTable,
  imagesBucket: storageStack.imagesBucket,
});

// Static hosting for the three SPAs. Independent of the API stack: the bundles
// are built ahead of synth with their VITE_* values already inlined.
new FrontendStack(app, `${prefix}-Frontend`, { env, config });
