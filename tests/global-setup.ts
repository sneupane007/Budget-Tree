import { execFileSync, execSync } from "node:child_process"
import fs from "node:fs"
import { request } from "@playwright/test"
import { closePool, seedBase, truncateAll } from "./helpers/db"
import {
  APP_URL, AUTH_DIR, PASSWORD, PG_BIN, PG_DATA, PG_PORT, ROOT, TEST_DB_URL, USERS, USER_KEYS, authFile,
} from "./helpers/env"

function pgReady() {
  try {
    execFileSync(`${PG_BIN}/pg_isready`, ["-h", "localhost", "-p", String(PG_PORT)], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function ensureDatabase() {
  if (!pgReady()) {
    if (!fs.existsSync(PG_DATA)) {
      execFileSync(`${PG_BIN}/initdb`, ["-D", PG_DATA, "--auth=trust", "-U", "postgres", "-E", "UTF8"], { stdio: "ignore" })
    }
    execFileSync(
      `${PG_BIN}/pg_ctl`,
      ["-D", PG_DATA, "-o", `-p ${PG_PORT} -k /tmp`, "-l", `${ROOT}/.test-db/pg.log`, "-w", "start"],
      { stdio: "ignore" }
    )
  }
  try {
    execFileSync(`${PG_BIN}/createdb`, ["-h", "localhost", "-p", String(PG_PORT), "-U", "postgres", "budgettree_test"], { stdio: "ignore" })
  } catch {
    /* already exists */
  }
}

export default async function globalSetup() {
  ensureDatabase()

  // Migrations go through the test-only Prisma config (never reads .env.local).
  execSync("npx prisma migrate deploy --config prisma.test.config.ts", {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, TEST_DATABASE_URL: TEST_DB_URL },
  })

  await truncateAll()
  await seedBase()
  await closePool()

  fs.mkdirSync(AUTH_DIR, { recursive: true })
  for (const key of USER_KEYS) {
    const ctx = await request.newContext({ baseURL: APP_URL })
    const csrf = await (await ctx.get("/api/auth/csrf")).json()
    const res = await ctx.post("/api/auth/callback/credentials", {
      form: { csrfToken: csrf.csrfToken, email: USERS[key].email, password: PASSWORD, json: "true" },
    })
    if (!res.ok()) throw new Error(`login failed for ${key}: ${res.status()}`)
    const session = await (await ctx.get("/api/auth/session")).json()
    if (session?.user?.email !== USERS[key].email) throw new Error(`no session for ${key}`)
    await ctx.storageState({ path: authFile(key) })
    await ctx.dispose()
  }
}
