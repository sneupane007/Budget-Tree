---
name: Common bug patterns in budgettree codebase
description: Recurring patterns of bugs found in the budgettree codebase during the 2026-03-13 review, useful for future reviews
type: project
---

Common bug patterns found in initial codebase review (2026-03-13):

1. **Decimal serialization gap**: API routes pass raw Prisma results to `success()` without calling `.toString()` on Decimal fields. This affects every route that returns monetary data. **Why:** Prisma 7 returns Decimal.js objects for `@db.Decimal` columns; `NextResponse.json()` serializes them as internal Decimal objects, not strings. **How to apply:** Every API route returning Prisma models with Decimal fields needs a serialization step.

2. **Client-side parseFloat for money**: `store/selectors.ts`, `components/tree/node-detail-panel.tsx`, and `lib/utils.ts` all use `parseFloat()` for monetary arithmetic instead of `Decimal`. **How to apply:** Flag any `parseFloat` usage on `allocatedAmount`, `spentAmount`, or `totalBudget` fields.

3. **Next.js 16 async params**: All dynamic route handlers use synchronous `params.id` access, which is deprecated in Next.js 15+ and will break. **How to apply:** Every file under `app/api/.../[param]/` needs `await params`.

4. **File upload outside transaction**: Both `/api/receipts` and `/api/signatures` upload files to Supabase before the DB transaction, creating orphaned files on failure.

5. **Missing audit log on DELETE**: The node delete handler doesn't create an audit trail.
