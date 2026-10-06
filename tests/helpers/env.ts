import path from "node:path"

export const ROOT = path.resolve(__dirname, "../..")

export const APP_PORT = 3100
export const UPSTASH_PORT = 4100
export const SUPABASE_PORT = 4101

export const APP_URL = `http://localhost:${APP_PORT}`
export const FAKE_UPSTASH_URL = `http://127.0.0.1:${UPSTASH_PORT}`
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${SUPABASE_PORT}`

export const PG_PORT = 54329
export const PG_BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@14/bin"
export const PG_DATA = path.join(ROOT, ".test-db/data")
export const TEST_DB_URL = `postgresql://postgres@localhost:${PG_PORT}/budgettree_test`

export const AUTH_DIR = path.join(ROOT, "tests/.auth")

export const PASSWORD = "password123"

// Two isolated orgs. Org A is the "home" org for the role matrix; org B exists
// only to prove cross-org isolation (every :id route must 404 across orgs).
export const USERS = {
  admin: { name: "Test Admin", email: "admin@a.test", role: "ADMIN", org: "A" },
  manager: { name: "Test Manager", email: "manager@a.test", role: "MANAGER", org: "A" },
  verifier: { name: "Test Verifier", email: "verifier@a.test", role: "VERIFIER", org: "A" },
  viewer: { name: "Test Viewer", email: "viewer@a.test", role: "VIEWER", org: "A" },
  otherAdmin: { name: "Other Admin", email: "admin@b.test", role: "ADMIN", org: "B" },
} as const

export type UserKey = keyof typeof USERS
export const USER_KEYS = Object.keys(USERS) as UserKey[]

export const authFile = (key: UserKey) => path.join(AUTH_DIR, `${key}.json`)

// Env the Next.js server runs with. Real process env beats .env.local in Next,
// so none of these can leak to the real Supabase/Upstash/DB.
export const SERVER_ENV = {
  DATABASE_URL: TEST_DB_URL,
  DIRECT_URL: TEST_DB_URL,
  KV_REST_API_URL: FAKE_UPSTASH_URL,
  KV_REST_API_TOKEN: "test-token",
  VERCEL_ENV_KV_REST_API_URL: FAKE_UPSTASH_URL,
  VERCEL_ENV_KV_REST_API_TOKEN: "test-token",
  NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXTAUTH_URL: APP_URL,
  NEXTAUTH_SECRET: "test-secret-not-for-production",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  RESEND_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DIST_DIR: ".next-test",
}
