# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

npm run db:migrate   # Run Prisma migrations (requires DIRECT_URL and DATABASE_URL in .env.local — migrations use the direct connection)
npm run db:seed      # Seed demo data (alice@demo.com / password123)
npm run db:studio    # Open Prisma Studio
npx prisma generate  # Regenerate Prisma client after schema changes
```

TypeScript checking: `npx tsc --noEmit`. **Note:** tsc will error on `@prisma/client` imports until `npx prisma generate` has been run (types are not committed).

```bash
npm test              # Playwright: API + E2E (~3.5 min). Also test:api, test:e2e, test:report
npx playwright test tests/api/spend.spec.ts --project=api   # single file
```

## Architecture
Layout: `app/api/*` routes, `app/(app)/*` authed pages, `components/{tree,nodes,receipts,signatures,settings}` feature UI, `lib/budget` budget logic, `lib/validators` zod schemas, `tests/{api,e2e}` Playwright specs.

### Prisma 7 config
The database URL lives in `prisma.config.ts`, **not** in `prisma/schema.prisma`. The `datasource` block in the schema has no `url` field — this is intentional (Prisma 7 breaking change).

### Project → BudgetNode relationship
`Project.rootNodeId` (FK on Project) → `BudgetNode`. `BudgetNode.projectId` → all nodes in the project. Fetching the full tree always uses a **flat query** (`findMany({ where: { projectId } })`), never recursive Prisma includes.

### Budget enforcement (critical paths)
- **`lib/budget/validate-allocation.ts`** — called before creating/reallocating any node. Sums all sibling `allocatedAmount` values and checks the requested amount fits within the parent's budget.
- **`lib/budget/recalculate-rollups.ts`** — `lockNodeChain()` locks a node + ancestors (ordered by id, `FOR UPDATE`), then `rollUpSpend()` adds the spend delta to every ancestor (incremental, so a parent's direct spend is kept). Must run inside a `prisma.$transaction()`. Raw SQL must use camelCase quoted columns (`"parentId"`, `"spentAmount"`); the schema has no `@map`. Called from `POST /api/nodes/[id]/spend`.
- Node create/allocate lock the parent row (`FOR UPDATE`) and call `validateAllocation(..., tx)` inside the transaction to prevent concurrent over-allocation.

### Zustand store (`store/`)
Three slices composed in `store/index.ts`: `TreeSlice`, `UISlice`, `ProjectSlice`.

`TreeSlice` holds a **flat node map** (`Record<id, BudgetNodeWithOwner>`). Every mutation (`setNodes`, `addNode`, `updateNode`, `removeNode`) rebuilds `flowNodes` and `flowEdges` via `buildFlowElements()` which runs the dagre layout algorithm. React Flow renders these derived arrays — never the raw tree.

### Caching (`lib/cache.ts`)
Upstash Redis, provisioned via the Vercel Marketplace. Keys are org-scoped: `cacheKey(orgId, ...parts)`. Any route that writes data must call `cacheInvalidate()`/`cacheInvalidatePattern()` for the affected keys — used across most `/api/*` routes (nodes, projects, org members, dashboard, receipts, signatures, audit). Env vars are `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel Marketplace naming, not `UPSTASH_REDIS_REST_URL`/`TOKEN`), with a `VERCEL_ENV_`-prefixed fallback if a second store is ever connected.

### Authentication
NextAuth.js v4 with JWT strategy. Session is augmented with `role` and `organizationId` (see `types/next-auth.d.ts`). Every API route calls `requireSession()` then scopes all DB queries to `session.user.organizationId` — never return data without this scope.

### File storage
Supabase Storage with 3 private buckets: `receipts`, `signatures`, `exports`. **Only file paths are stored in the DB**, never signed URLs. Call `getSignedUrl()` from `lib/storage.ts` at read time (1hr expiry for receipts).

### Public routes
`app/home/page.tsx` is the public marketing/landing page (no auth check). `app/page.tsx` redirects to `/dashboard` (logged in) or `/home` (logged out). Auth-only pages live inside `app/(app)/`.

### Auth middleware
Auth guard lives in `proxy.ts` (root) — **not** `middleware.ts`. Next.js 16 renamed the convention; using `middleware.ts` produces a deprecation warning.

### API routes
All routes return `{ data, error }` envelope via helpers in `lib/api-response.ts`. Auth errors throw `AuthError` (from `lib/auth-helpers.ts`) which routes catch and convert to 401/403 responses.

**Next.js 16:** Route handler **and page** `params` is a `Promise` — always type as `{ params: Promise<{ id: string }> }` and `await params` before use. Reading `params.id` synchronously gives `undefined`, and Prisma treats `where: { id: undefined }` as no filter (this once leaked every org's nodes).

Role gates: create/patch projects & nodes = ADMIN/MANAGER; spend/receipts/signatures = ADMIN/MANAGER/VERIFIER (VIEWER excluded). Parse bodies with `await req.json().catch(() => { throw new AuthError("Invalid JSON body", 400) })`.

### Monetary values
Always use `decimal.js` (`Decimal`) for arithmetic. Prisma returns `Decimal` objects — call `.toString()` before passing to the client. Never use JS `number` for money. Request amounts go through `positiveAmount()` (`lib/validators/money.ts`): digits only, max 2 decimals, max 16 integer digits.

### Zod v4 + React Hook Form
Zod schemas must **not** use `.default()` — it creates input/output type mismatch with `@hookform/resolvers` v5. Set default values via `useForm({ defaultValues: ... })` instead.

## Testing (`tests/`, `playwright.config.ts`)
First run on a new machine: `npx playwright install chromium`. Needs Homebrew `postgresql@14` (override the binary dir with `PG_BIN`). Ports, env and role users are defined in `tests/helpers/env.ts`.
Playwright runs against an isolated stack, never your real services: a private Postgres 14 in `.test-db/` (port 54329, auto-started), fake Upstash + fake Supabase Storage (`tests/helpers/fake-services.ts`), and `next dev` on :3100 with `NEXT_DIST_DIR=.next-test` so it can run beside `npm run dev`. One worker; specs share the DB.
- **Never run `prisma/seed.ts` or `prisma migrate` for tests.** `prisma.config.ts` loads `.env.local` with `override: true` and would hit the real DB (the seed starts with `deleteMany`). Tests use `prisma.test.config.ts` + `tests/helpers/db.ts`, which refuse any non-local, non-"test" database.
- Fixtures in `tests/fixtures.ts`: `as(role)` (admin/manager/verifier/viewer in org A, `otherAdmin` in org B), `anon`, `registerOrg()` (fresh org for aggregate assertions), `createProject`/`createNode`, `flushCache()`, `storedObjects()`.
- Known-open bugs are encoded as `test.fail(true, "BUG: ...")` asserting the correct behavior. When you fix one, Playwright reports "Expected to fail, but passed": remove the `test.fail` line.
- No `data-testid`s exist; use role/label/text locators. Radix Select options can render off-screen in long lists: pick with the keyboard, not `.click()`.
- Playwright JSON-encodes string `data`; send `Buffer.from("{bad")` to test malformed JSON bodies.

## Supabase project
- Project ID: `mfzoikxaubjzyyjmabzq` (region: us-east-1)
- Dashboard: https://supabase.com/dashboard/project/mfzoikxaubjzyyjmabzq
- Storage buckets: `receipts` (10MB, images+PDF), `signatures` (2MB, PNG only), `exports`
