# BudgetTree

A hierarchical budget management platform for organizations. Budget allocations are structured as a tree of nodes — each node can own a slice of a parent's budget, track spending, and require verification via receipts and signatures.

Visit `/home` for the public landing page, or `/dashboard` after signing in.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth.js v4 (JWT strategy) |
| File Storage | Supabase Storage |
| State Management | Zustand 5 (sliced store) |
| UI | React Flow + Radix UI + Tailwind CSS v4 |
| Validation | Zod v4 + React Hook Form v7 |
| Money | decimal.js |
| Background Jobs | BullMQ + Upstash Redis |
| Email | Resend |

---

## Prerequisites

- Node.js 20+
- PostgreSQL database (local or remote)
- Supabase project (for file storage)
- Upstash Redis (for background jobs)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local` with the following:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/budgettree

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

RESEND_API_KEY=re_...
```

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. (Optional) Seed demo data

```bash
npm run db:seed
# Creates: alice@demo.com / password123
```

### 5. Start the dev server

```bash
npm run dev
# http://localhost:3000
```

---

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio GUI
npx prisma generate  # Regenerate Prisma client after schema changes
npx tsc --noEmit     # TypeScript type check (no test suite exists)
```

---

## Architecture

### Directory structure

```
app/
  home/           # Public landing page (no auth required)
  (app)/          # Authenticated app routes (dashboard, projects, nodes)
  (auth)/         # Login / register pages
  api/            # API route handlers
components/       # Shared UI components
lib/
  budget/         # Budget validation and rollup logic (critical — read carefully)
  storage.ts      # Supabase Storage helpers
  api-response.ts # { data, error } response envelope
  auth-helpers.ts # requireSession(), AuthError
store/            # Zustand slices (Tree, UI, Project)
types/            # Global TypeScript types, next-auth augmentation
prisma/
  schema.prisma   # DB schema
  seed.ts         # Demo data seeder
prisma.config.ts  # Prisma 7 database URL config (NOT in schema.prisma)
proxy.ts          # Auth middleware (Next.js 16 — NOT middleware.ts)
```

### Prisma 7 — database URL config

Prisma 7 moves the database URL out of `prisma/schema.prisma`. The `datasource` block in the schema has **no `url` field** — this is intentional. The URL is configured in `prisma.config.ts` instead. Do not add a `url` to the schema.

### Data model overview

```
Organization
  └── User (role: ADMIN | MANAGER | VERIFIER | VIEWER)
  └── Project (totalBudget, currency, status)
        └── BudgetNode (tree via parentId self-relation)
              ├── allocatedAmount  — budget assigned to this node
              ├── spentAmount      — rolled up from children + direct spend
              ├── Receipt[]        — uploaded proof of spend
              ├── Signature[]      — approval signatures
              └── AuditLog[]
```

`Project.rootNodeId` points to the top-level `BudgetNode`. All nodes in a project share `BudgetNode.projectId`. The tree is always fetched **flat** (`findMany({ where: { projectId } })`) and assembled in-memory — never via recursive Prisma includes.

### Budget enforcement (critical paths)

Two files gate all budget mutations — read them before touching any spend or allocation logic:

- **`lib/budget/validate-allocation.ts`** — called before creating or reallocating any node. Sums all sibling `allocatedAmount` values and ensures the requested amount fits within the parent's remaining budget.
- **`lib/budget/recalculate-rollups.ts`** — raw SQL recursive CTE that walks upward from a node and updates all ancestor `spentAmount` values. Must always run inside `prisma.$transaction()`. Called from `POST /api/nodes/[id]/spend`.

### Zustand store

Three slices composed in `store/index.ts`: `TreeSlice`, `UISlice`, `ProjectSlice`.

`TreeSlice` holds a **flat node map** (`Record<id, BudgetNodeWithOwner>`). Every mutation (`setNodes`, `addNode`, `updateNode`, `removeNode`) triggers `buildFlowElements()`, which runs the dagre layout algorithm to produce `flowNodes` and `flowEdges`. React Flow renders these derived arrays — never the raw map directly.

### Authentication

NextAuth.js v4 with JWT strategy. The session is augmented with `role` and `organizationId` (see `types/next-auth.d.ts`). Every API route must call `requireSession()` and scope all DB queries to `session.user.organizationId`. Never return data without this scope check.

### API routes

All routes return a `{ data, error }` envelope via helpers in `lib/api-response.ts`. Auth errors throw `AuthError` (from `lib/auth-helpers.ts`), which routes catch and convert to 401/403 responses.

### File storage

Supabase Storage with 3 private buckets:

| Bucket | Limit | Types |
|---|---|---|
| `receipts` | 10 MB | images, PDF |
| `signatures` | 2 MB | PNG only |
| `exports` | — | — |

**Only file paths are stored in the database**, never signed URLs. Call `getSignedUrl()` from `lib/storage.ts` at read time (1-hour expiry for receipts).

### Monetary values

Always use `decimal.js` (`Decimal`) for arithmetic. Prisma returns `Decimal` objects — call `.toString()` before passing values to the client. **Never use JS `number` for money.**

### Forms and validation

Zod v4 + React Hook Form v7. Zod schemas must **not** use `.default()` — it causes an input/output type mismatch with `@hookform/resolvers` v5. Set defaults via `useForm({ defaultValues: ... })` instead.

---

## Roles

| Role | Capabilities |
|---|---|
| `ADMIN` | Full access, manage users and org |
| `MANAGER` | Create projects and nodes, allocate budget |
| `VERIFIER` | Review and sign off on spend |
| `VIEWER` | Read-only |

---

## Supabase project

- Project ID: `mfzoikxaubjzyyjmabzq` (region: us-east-1)
- Dashboard: https://supabase.com/dashboard/project/mfzoikxaubjzyyjmabzq
