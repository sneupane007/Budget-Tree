// Test-only Prisma config. Unlike prisma.config.ts it never loads .env/.env.local,
// so `prisma migrate deploy --config prisma.test.config.ts` can only ever touch
// the isolated test database.
import { defineConfig } from "prisma/config"

const url = process.env.TEST_DATABASE_URL
if (!url || !/localhost|127\.0\.0\.1/.test(url) || !/test/.test(url)) {
  throw new Error("prisma.test.config.ts: TEST_DATABASE_URL must point at a local *test* database")
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
})
