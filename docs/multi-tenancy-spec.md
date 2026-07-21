# Multi-Tenancy: Multiple Warranty Companies — Design

Status: draft for review · Author: Claude Code · Scope: support many warranty
companies on one platform, each with their own ruleset and repairer network.

## 1. Goal

Onboard multiple warranty companies onto a single Repair XChange deployment.
Each company:
- has **its own ruleset** — eligibility rules (e.g. a different damage-size
  limit — "size-1 football" vs "size-5") and its **own pricing matrix**;
- has **its own repairer network**, links that admin can toggle on/off per
  company;
- may **push jobs** from its own systems via an integration (contract TBD);
- must be **separable** — companies may not want their data co-mingled.

Admin/Xpert users must be able to see and act **across all companies**.

## 2. The isolation decision (decided)

**Pooled (row-level) multi-tenancy on one deployment**, not physical silos.

| Model | Fit |
|---|---|
| **Pooled** — shared tables, `warrantyCompanyId` on every tenant entity, scope enforced per query | ✅ Chosen |
| Siloed — separate tables/DBs/stacks/accounts per company | ❌ Rejected |
| Bridge — pooled by default, silo a tenant on demand | Kept as a future option (see below) |

**Why pooled:**
- Admin/Xpert need a cross-company view. That is trivial when pooled and
  painful when siloed (fan-out across N stores). This requirement alone rules
  out silo.
- No appetite to deploy/operate separate tenants.
- Physical separation is a "may", not a known contractual requirement — don't
  pay the silo tax on a maybe.

**Keeping the door open:** all tenant data access goes through a tenant-keyed
access layer (repositories take/enforce `warrantyCompanyId`). If a single client
ever contractually demands physical separation, that one tenant can be routed to
a dedicated store behind the same interface — without a rewrite. We build none
of that now; we just never scatter raw un-scoped table access.

## 3. Current state (what we're changing)

- **No tenant concept exists.** No `warrantyCompanyId`/`tenantId` on any entity.
- **Ruleset is hardcoded + deploy-global.** `WarrantyScheme { id, name,
  eligibility, matrix }` lives in TypeScript (`packages/core/src/schemes/*.ts`)
  and is selected by a single `WARRANTY_SCHEME` env var, read once per Lambda
  (`getActiveScheme(process.env.WARRANTY_SCHEME)`). One active scheme per
  deployment.
- **Repairers are a global pool** — no company membership, no per-company on/off.
- **Cases are consumer-submitted** — no company origin, no job-push ingestion.

The scheme *shape* is a good foothold — `EligibilityRules` and `MatrixConfig`
are exactly the per-company knobs. They just have to move from code-global to
per-company data, looked up at runtime.

## 4. Data model additions

### 4.1 `WarrantyCompany` (the tenant)
```
warrantyCompanyId  (PK)
name, status (ACTIVE | INACTIVE)
scheme: { eligibility: EligibilityRules, matrix: MatrixConfig }   // their ruleset, as DATA
createdAt, updatedAt
```
The `scheme` reuses the existing `EligibilityRules` / `MatrixConfig` types,
**validated with zod on write**. New table `warranty-companies`.

### 4.2 Tenant stamping
`warrantyCompanyId` added to **case** (set at creation) → inherited by **job** →
**payment**. Backfill existing rows to a default company on migration.

### 4.3 `RepairerNetworkLink` (per-company network)
```
warrantyCompanyId + repairerId  (composite)
enabled: boolean
GSI by warrantyCompanyId (list a company's network) and by repairerId
```
A job for company X only reaches repairers linked **and** enabled for X. Admin
toggles these. This is also what the (parked) matching work should key off.

## 5. Ruleset resolution (the heart of the ask)

- Replace `getActiveScheme(env)` with **`getSchemeForCompany(warrantyCompanyId)`**
  reading the company's stored `scheme` (short-lived cache per Lambda).
- Triage worker and Xpert review resolve the scheme from **the case's
  `warrantyCompanyId`**, not the env global.
- **Onboarding** a company = create a `WarrantyCompany` with a ruleset, seeded
  from an existing scheme as a template, then edited (their football size, their
  matrix prices). No deploy required.
- The hardcoded `schemes/*.ts` become **seed templates**, not the source of truth.

**Authoring (assumption — confirm):** ruleset creation/editing is
**internal-only** (admin/Xpert) in the admin app for phase 1, not self-serve by
the warranty company. Flip this if companies should edit their own rules.

## 6. Auth & tenant scoping
- Company-facing users (and the ingestion credential) carry a
  `warrantyCompanyId` (Cognito custom attribute); every tenant-owned query is
  scoped to it.
- **Admin/Xpert bypass the scope** — full cross-company visibility (the stated
  requirement). Enforced centrally in the auth/repository layer, not per handler.

## 7. Job-push ingestion (later phase)
Per-company credential (API key / OAuth client) identifies the tenant; an
inbound endpoint maps an external job → an internal case stamped with that
company, bypassing consumer upload. Contract is undefined today — treated as its
own phase once a first integration partner is known.

## 8. Phasing
1. **Tenant + onboardable rulesets** — `WarrantyCompany` entity, ruleset-as-data,
   `getSchemeForCompany`, per-case lookup, seed from templates. *Heart of the ask.*
2. **Admin onboarding + ruleset editor** — create a company, author/edit its
   eligibility + matrix (internal-only).
3. **Tenant stamping + scoped queries** — `warrantyCompanyId` on case/job/payment,
   scope enforcement, admin/Xpert cross-company; migrate existing rows.
4. **Per-company repairer networks** — `RepairerNetworkLink` + admin on/off; jobs
   scoped to a company's enabled repairers.
5. **Job-push ingestion API** — per-company credentials, external → case.

Additive throughout — nothing here forces separate deployments.

## 9. Open decisions
1. Ruleset authoring: internal-only (assumed) vs self-serve by the company?
2. Case attribution: does a consumer *belong to* a company, and/or does every
   case arrive via the ingestion API? (Shapes phase 3 + 5.)
3. Default company for backfilling existing single-tenant data on migration.
4. Matrix versioning per company — keep stored quotes reproducible when a
   company edits its matrix (bump `matrix.version` on edit; quotes already store
   the version).
