# OneAutoAPI SDK — reference only (DO NOT build/import)

Generated `typescript-node` SDK from https://www.oneautoapi.com, kept purely as a
**contract reference** for the vehicle-lookup integration in
[`packages/api/src/handlers/vehicles/lookup.ts`](../../packages/api/src/handlers/vehicles/lookup.ts).

It is intentionally **outside the pnpm workspace** (`pnpm-workspace.yaml` only globs
`apps/*` and `packages/*`) so it is never built, typechecked, or bundled.

Do not add it as a dependency:
- Every `api/*.ts` imports the **deprecated `request`** library (CJS-only) — it will
  not tree-shake into our ESM/esbuild Lambda bundles.
- The generated key enums are invalid TypeScript (`enum { x-api-key }`), so the
  package does not even compile.

We call the API with a thin native `fetch` client instead. What this SDK tells us:

- **Auth header:** `x-api-key`
- **Base URL:** `https://sandbox.oneautoapi.com` (sandbox); production is `https://api.oneautoapi.com`
- **Reg lookup lives per data-provider**, e.g.:
  - `GET /ukvehicledata/keyvehicledetailsfromvrm/v2`
  - `GET /ukvehicledata/vehicleandmodeldetailsfromvrm/v2`
  - `GET /autotrader/vehiclelookupfromvrm`
- **Query param:** `vehicle_registration_mark`
- Response types are in `model/` (e.g. `ukvehicledataKeyvehicledetailsfromvrm200Response.ts`).
