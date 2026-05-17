# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

npm run db:migrate   # Run Prisma migrations (requires DATABASE_URL in .env.local)
npm run db:seed      # Seed demo data (alice@demo.com / password123)
npm run db:studio    # Open Prisma Studio
npx prisma generate  # Regenerate Prisma client after schema changes
```

There are no automated tests. TypeScript checking: `npx tsc --noEmit`. **Note:** tsc will error on `@prisma/client` imports until `npx prisma generate` has been run (types are not committed).

## Architecture

### Prisma 7 config
The database URL lives in `prisma.config.ts`, **not** in `prisma/schema.prisma`. The `datasource` block in the schema has no `url` field — this is intentional (Prisma 7 breaking change).

### Project → BudgetNode relationship
`Project.rootNodeId` (FK on Project) → `BudgetNode`. `BudgetNode.projectId` → all nodes in the project. Fetching the full tree always uses a **flat query** (`findMany({ where: { projectId } })`), never recursive Prisma includes.

### Budget enforcement (critical paths)
- **`lib/budget/validate-allocation.ts`** — called before creating/reallocating any node. Sums all sibling `allocatedAmount` values and checks the requested amount fits within the parent's budget.
- **`lib/budget/recalculate-rollups.ts`** — raw SQL recursive CTE that walks upward from a node to update all ancestor `spentAmount` values. Must always run inside a `prisma.$transaction()`. Called from `POST /api/nodes/[id]/spend`.

### Zustand store (`store/`)
Three slices composed in `store/index.ts`: `TreeSlice`, `UISlice`, `ProjectSlice`.

`TreeSlice` holds a **flat node map** (`Record<id, BudgetNodeWithOwner>`). Every mutation (`setNodes`, `addNode`, `updateNode`, `removeNode`) rebuilds `flowNodes` and `flowEdges` via `buildFlowElements()` which runs the dagre layout algorithm. React Flow renders these derived arrays — never the raw tree.

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

**Next.js 16:** Route handler `params` is a `Promise` — always type as `{ params: Promise<{ id: string }> }` and `await params` before use.

### Monetary values
Always use `decimal.js` (`Decimal`) for arithmetic. Prisma returns `Decimal` objects — call `.toString()` before passing to the client. Never use JS `number` for money.

### Zod v4 + React Hook Form
Zod schemas must **not** use `.default()` — it creates input/output type mismatch with `@hookform/resolvers` v5. Set default values via `useForm({ defaultValues: ... })` instead.

## Supabase project
- Project ID: `mfzoikxaubjzyyjmabzq` (region: us-east-1)
- Dashboard: https://supabase.com/dashboard/project/mfzoikxaubjzyyjmabzq
- Storage buckets: `receipts` (10MB, images+PDF), `signatures` (2MB, PNG only), `exports`
