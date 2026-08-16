# COREXPERT — Claude Code Project Config

## Project Overview

AI-powered vehicle damage assessment and repair marketplace. Consumers submit vehicle damage images, receive AI triage with repair cost estimates, and can publish jobs to "The Repair Xchange" where repairers accept (fastest finger wins) and pay an introduction fee.

## Monorepo Structure

- **pnpm workspaces** with `workspace:*` protocol
- `apps/consumer` — Consumer React SPA (port 3000)
- `apps/repairer` — Repairer React SPA (port 3001)
- `apps/admin` — Admin/Xpert React SPA (port 3002)
- `packages/core` — Shared types, enums, errors, constants, utilities
- `packages/db` — DynamoDB client, table definitions, repositories
- `packages/ai` — AI abstraction layer (swappable providers via strategy pattern)
- `packages/api` — Lambda function handlers, middleware, templates
- `packages/cdk` — AWS CDK infrastructure stacks

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, React Router v7, TanStack Query, Tailwind CSS v4 |
| Backend | AWS Lambda (TypeScript, ESM, Node 20, ARM64) |
| Database | DynamoDB (multi-table, denormalized documents) |
| AI | AWS Bedrock (Claude Vision, swappable) |
| Auth | AWS Cognito (single user pool, role groups) |
| Payments | Stripe Checkout |
| Images | S3 presigned upload |
| Email | SES |
| IaC | AWS CDK (TypeScript) |

## Key Conventions

- **TypeScript strict mode** everywhere (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **ESM modules** — use `.js` extensions in imports for compiled output
- **All monetary values in pence** (integer arithmetic, no floats)
- **Const object enums** — use `as const` objects, not TypeScript `enum` keyword
- **Error hierarchy** — extend `AppError` base class for domain errors
- **Repository pattern** — one repository class per DynamoDB table
- **Strategy pattern** — AI providers implement `IDamageAssessor` interface
- **No VPC** — DynamoDB + S3 + Bedrock all accessible without VPC

## Common Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Type-check all packages
pnpm -r typecheck

# Run tests
pnpm -r test

# Lint
pnpm -r lint

# CDK deploy (dev)
# The context key is `env`, not `stage` — bin/app.ts reads tryGetContext('env'),
# so `-c stage=dev` silently falls through to the default stage.
cd packages/cdk && npx cdk deploy --all -c env=dev --require-approval never

# Start consumer app
cd apps/consumer && pnpm dev

# Start repairer app
cd apps/repairer && pnpm dev

# Start admin app
cd apps/admin && pnpm dev
```

## DynamoDB Tables

All table names are stage-prefixed: `corexpert-{stage}-{table}`

- `cases` — PK: caseId. GSIs: userId-createdAt-index, status-createdAt-index
- `jobs` — PK: jobId. GSIs: status-publishedAt-index, caseId-index
- `users` — PK: userId. GSIs: email-index, role-index
- `payments` — PK: paymentId. GSIs: stripePaymentIntentId-index, jobId-index

## API Response Format

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, details?: unknown } }
```

## Branching

- `main` — production branch
- `claude/*` — feature branches from Claude Code sessions

## Important Files

- `packages/core/src/constants/` — Lookup tables for labour rates, times, parts prices, paint costs
- `packages/core/src/utils/cost-calculator.ts` — Repair cost calculation engine
- `packages/db/src/tables.ts` — Table name constants and GSI definitions
- `packages/cdk/lib/config/environments.ts` — Stage-specific CDK configuration
- `packages/api/src/middleware/auth.ts` — Cognito JWT auth middleware
