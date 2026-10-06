import { test as base, expect, request, type APIRequestContext, type APIResponse } from "@playwright/test"
import { getPool } from "./helpers/db"
import {
  APP_URL, FAKE_SUPABASE_URL, FAKE_UPSTASH_URL, PASSWORD, USERS, authFile, type UserKey,
} from "./helpers/env"

type Fixtures = {
  /** Authenticated API client for a seeded role (org A: admin/manager/verifier/viewer, org B: otherAdmin). */
  as: (role: UserKey) => Promise<APIRequestContext>
  /** Client with no cookies. */
  anon: APIRequestContext
}

export const test = base.extend<Fixtures>({
  as: async ({}, use) => {
    const made: APIRequestContext[] = []
    await use(async (role) => {
      const ctx = await request.newContext({ baseURL: APP_URL, storageState: authFile(role) })
      made.push(ctx)
      return ctx
    })
    await Promise.all(made.map((c) => c.dispose()))
  },
  anon: async ({}, use) => {
    const ctx = await request.newContext({ baseURL: APP_URL })
    await use(ctx)
    await ctx.dispose()
  },
})

export { expect }

// ── response helpers ────────────────────────────────────────────────
export async function data<T = any>(res: APIResponse, status = 200): Promise<T> {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(status)
  expect(body?.error ?? null).toBeNull()
  return body.data as T
}

export async function errorOf(res: APIResponse, status: number) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(status)
  expect(body?.data ?? null).toBeNull()
  return body as { data: null; error: string; issues?: { path: string; message: string }[] }
}

// ── fake-service controls ───────────────────────────────────────────
export const flushCache = () => fetch(`${FAKE_UPSTASH_URL}/__flush`, { method: "POST" })
export const cacheKeys = async (): Promise<string[]> =>
  (await (await fetch(`${FAKE_UPSTASH_URL}/__keys`)).json()).keys
export const resetStorage = () => fetch(`${FAKE_SUPABASE_URL}/__reset`, { method: "POST" })
export const storedObjects = async (): Promise<{ key: string; size: number; contentType: string }[]> =>
  (await (await fetch(`${FAKE_SUPABASE_URL}/__objects`)).json()).objects
export const failNextStorageCall = (count = 1) =>
  fetch(`${FAKE_SUPABASE_URL}/__fail-next`, { method: "POST", body: JSON.stringify({ count }) })

// ── factories (all go through the real API) ─────────────────────────
let seq = 0
export const uniq = (p = "t") => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

export async function userId(role: UserKey): Promise<string> {
  const { rows } = await getPool().query(`SELECT id FROM "User" WHERE email=$1`, [USERS[role].email])
  return rows[0].id
}

export async function createProject(api: APIRequestContext, totalBudget = "100000.00", name = uniq("proj")) {
  const res = await api.post("/api/projects", { data: { name, totalBudget, currency: "USD" } })
  const proj = await data(res, 201)
  return { project: proj, rootId: (proj.rootNodeId ?? proj.rootNode?.id) as string, projectId: proj.id as string }
}

export async function createNode(
  api: APIRequestContext,
  parentId: string,
  allocatedAmount: string,
  ownerId: string,
  name = uniq("node")
) {
  const res = await api.post("/api/nodes", { data: { name, allocatedAmount, currency: "USD", parentId, ownerId } })
  return data<any>(res, 201)
}

/** Register a brand-new org (+ ADMIN) and return a logged-in client. For tests that need an empty org (dashboard totals etc). */
export async function registerOrg(orgType: "BUSINESS" | "NGO" | "GOVERNMENT" = "BUSINESS") {
  const email = `${uniq("reg")}@fresh.test`
  const anon = await request.newContext({ baseURL: APP_URL })
  const res = await anon.post("/api/register", {
    data: { name: "Fresh Admin", email, password: PASSWORD, orgName: "Fresh Org", orgType },
  })
  const user = await data<any>(res, 201)
  const csrf = await (await anon.get("/api/auth/csrf")).json()
  await anon.post("/api/auth/callback/credentials", {
    form: { csrfToken: csrf.csrfToken, email, password: PASSWORD, json: "true" },
  })
  return { api: anon, user, email }
}
