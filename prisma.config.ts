import { config } from "dotenv"
// Load .env first, then let .env.local override it — matches Next.js's own
// precedence so `prisma migrate`/`prisma studio` see the same values the app does.
config({ path: ".env" })
config({ path: ".env.local", override: true })

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need the direct (non-pooled) connection; DATABASE_URL is the
    // pooled one the app uses at runtime.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL)!,
  },
})
