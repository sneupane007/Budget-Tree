import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { Pool } from "pg"
import { PASSWORD, TEST_DB_URL, USERS } from "./env"

// Hard guard: no helper in this suite may ever open a non-test database.
export function assertTestDb(url: string = TEST_DB_URL) {
  const u = new URL(url)
  const host = u.hostname
  const name = u.pathname.replace(/^\//, "")
  if (!["localhost", "127.0.0.1"].includes(host) || !name.includes("test")) {
    throw new Error(`Refusing to use database ${host}/${name}: must be a local *test* database`)
  }
}

let pool: Pool | undefined
export function getPool() {
  assertTestDb()
  return (pool ??= new Pool({ connectionString: TEST_DB_URL, max: 4 }))
}

export async function closePool() {
  await pool?.end()
  pool = undefined
}

// cuid-shaped (zod's z.cuid() needs /^c[^\s-]{8,}$/)
export const cuid = () => "c" + randomBytes(12).toString("hex")

export async function truncateAll() {
  await getPool().query(
    `TRUNCATE "AuditLog","Signature","Receipt","BudgetNode","Project","Session","Account","User","Organization","VerificationToken" RESTART IDENTITY CASCADE`
  )
}

export type SeededIds = {
  orgA: string
  orgB: string
  users: Record<keyof typeof USERS, string>
}

export async function seedBase(): Promise<SeededIds> {
  const p = getPool()
  const hash = await bcrypt.hash(PASSWORD, 4) // low cost: tests only
  const orgA = cuid()
  const orgB = cuid()
  await p.query(`INSERT INTO "Organization"(id,name,type) VALUES ($1,'Org A','GOVERNMENT'),($2,'Org B','NGO')`, [orgA, orgB])
  const users = {} as SeededIds["users"]
  for (const [key, u] of Object.entries(USERS)) {
    const id = cuid()
    users[key as keyof typeof USERS] = id
    await p.query(
      `INSERT INTO "User"(id,name,email,password,role,"organizationId") VALUES ($1,$2,$3,$4,$5::"Role",$6)`,
      [id, u.name, u.email, hash, u.role, u.org === "A" ? orgA : orgB]
    )
  }
  return { orgA, orgB, users }
}
