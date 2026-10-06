import { test, expect, data, errorOf, uniq, userId, registerOrg } from "../fixtures"
import { USERS, PASSWORD } from "../helpers/env"
import { request } from "@playwright/test"
import { APP_URL } from "../helpers/env"
import type { APIRequestContext } from "@playwright/test"

test.setTimeout(120_000)

const invitePayload = (role = "VIEWER", over: Record<string, unknown> = {}) => ({
  name: "New Member", email: `${uniq("m")}@a.test`, role, password: PASSWORD, ...over,
})

async function invite(api: APIRequestContext, role = "VIEWER", over: Record<string, unknown> = {}) {
  const body = invitePayload(role, over)
  const member = await data(await api.post("/api/org/members", { data: body }), 200)
  return { member, body }
}

async function loginAs(email: string, password = PASSWORD) {
  const ctx = await request.newContext({ baseURL: APP_URL })
  const csrf = await (await ctx.get("/api/auth/csrf")).json()
  await ctx.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password, json: "true" } })
  return { ctx, session: await (await ctx.get("/api/auth/session")).json() }
}

test.describe("GET /api/org/members", () => {
  test("anon -> 401 JSON (route is not covered by proxy matcher)", async ({ anon }) => {
    await errorOf(await anon.get("/api/org/members", { maxRedirects: 0 }), 401)
  })

  for (const role of ["admin", "manager", "verifier", "viewer"] as const) {
    test(`${role} can list members of own org only`, async ({ as }) => {
      const api = await as(role)
      const list = await data<any[]>(await api.get("/api/org/members"))
      const emails = list.map((m) => m.email)
      for (const e of ["admin@a.test", "manager@a.test", "verifier@a.test", "viewer@a.test"]) expect(emails).toContain(e)
      expect(emails).not.toContain("admin@b.test")
    })
  }

  test("members have safe fields only (no password)", async ({ as }) => {
    const list = await data<any[]>(await (await as("viewer")).get("/api/org/members"))
    for (const m of list) {
      expect(Object.keys(m).sort()).toEqual(["createdAt", "email", "id", "name", "role"])
    }
  })

  test("org B admin sees only org B", async ({ as }) => {
    const list = await data<any[]>(await (await as("otherAdmin")).get("/api/org/members"))
    expect(list.map((m) => m.email)).toEqual(["admin@b.test"])
  })

  test("invite is reflected in subsequent GET (cache invalidated)", async ({ as }) => {
    const api = await as("admin")
    await data(await api.get("/api/org/members")) // warm cache
    const { member } = await invite(api)
    const list = await data<any[]>(await api.get("/api/org/members"))
    expect(list.map((m) => m.id)).toContain(member.id)
  })
})

test.describe("POST /api/org/members", () => {
  test("anon -> 401", async ({ anon }) => {
    await errorOf(await anon.post("/api/org/members", { data: invitePayload() }), 401)
  })

  for (const role of ["manager", "verifier", "viewer"] as const) {
    test(`${role} -> 403`, async ({ as }) => {
      await errorOf(await (await as(role)).post("/api/org/members", { data: invitePayload() }), 403)
    })
  }

  test("admin invites -> 200, no password in response, member in admin's org", async ({ as }) => {
    const api = await as("admin")
    const { member, body } = await invite(api, "MANAGER")
    expect(member).toMatchObject({ name: body.name, email: body.email, role: "MANAGER" })
    expect(member.password).toBeUndefined()
    const mine = await data<any[]>(await api.get("/api/org/members"))
    expect(mine.map((m) => m.id)).toContain(member.id)
    const other = await data<any[]>(await (await as("otherAdmin")).get("/api/org/members"))
    expect(other.map((m) => m.id)).not.toContain(member.id)
  })

  test("invited user can log in with given password and gets invited role + admin's org", async ({ as }) => {
    const api = await as("admin")
    const { member, body } = await invite(api, "VERIFIER")
    const { ctx, session } = await loginAs(body.email as string)
    expect(session.user.role).toBe("VERIFIER")
    expect(session.user.id).toBe(member.id)
    const sAdmin = await (await api.get("/api/auth/session")).json()
    expect(session.user.organizationId).toBe(sAdmin.user.organizationId)
    await ctx.dispose()
  })

  for (const role of ["ADMIN", "MANAGER", "VERIFIER", "VIEWER"]) {
    test(`accepts role ${role}`, async ({ as }) => {
      const { member } = await invite(await as("admin"), role)
      expect(member.role).toBe(role)
    })
  }

  test("duplicate email -> 409", async ({ as }) => {
    const api = await as("admin")
    const { body } = await invite(api)
    await errorOf(await api.post("/api/org/members", { data: body }), 409)
  })

  test("email of member in another org -> 409 (global uniqueness)", async ({ as }) => {
    await errorOf(await (await as("admin")).post("/api/org/members", { data: invitePayload("VIEWER", { email: "admin@b.test" }) }), 409)
  })

  const cases: [string, Record<string, unknown>, string][] = [
    ["short name", { name: "A" }, "name"],
    ["invalid email", { email: "nope" }, "email"],
    ["invalid role", { role: "OWNER" }, "role"],
    ["short password (5)", { password: "12345" }, "password"],
  ]
  for (const [label, patch, path] of cases) {
    test(`422 for ${label}`, async ({ as }) => {
      const err = await errorOf(await (await as("admin")).post("/api/org/members", { data: invitePayload("VIEWER", patch) }), 422)
      expect(err.issues!.map((i) => i.path)).toContain(path)
    })
  }

  test("6-char password accepted (boundary)", async ({ as }) => {
    await invite(await as("admin"), "VIEWER", { password: "123456" })
  })

  test("non-admin gets 403 even with invalid body (role check precedes validation)", async ({ as }) => {
    await errorOf(await (await as("viewer")).post("/api/org/members", { data: {} }), 403)
  })

  test("cannot inject organizationId via body", async ({ as }) => {
    const api = await as("admin")
    const orgB = await (await (await as("otherAdmin")).get("/api/auth/session")).json()
    const { member } = await invite(api, "VIEWER", { organizationId: orgB.user.organizationId })
    const other = await data<any[]>(await (await as("otherAdmin")).get("/api/org/members"))
    expect(other.map((m) => m.id)).not.toContain(member.id)
  })

  test("malformed JSON body returns 400", async ({ as }) => {
    const res = await (await as("admin")).post("/api/org/members", { headers: { "Content-Type": "application/json" }, data: Buffer.from("{oops") })
    expect(res.status()).toBe(400)
  })

  test("BUG: invite allows 6-char passwords but registration requires 8 (policy mismatch)", async ({ as }) => {
    test.fail(true, "BUG: invite allows 6-char passwords but registration requires 8 (policy mismatch)")
    const res = await (await as("admin")).post("/api/org/members", { data: invitePayload("VIEWER", { password: "1234567" }) })
    expect(res.status()).toBe(422)
  })

  test("BUG: invite duplicate check is case-sensitive", async ({ as }) => {
    test.fail(true, "BUG: invite duplicate check is case-sensitive")
    const api = await as("admin")
    const { body } = await invite(api, "VIEWER", { email: `${uniq("ci")}@a.test` })
    const res = await api.post("/api/org/members", { data: { ...body, email: (body.email as string).replace("@a.test", "@A.test") } })
    expect(res.status()).toBe(409)
  })
})

test.describe("PATCH /api/org/members/[id]", () => {
  test("anon -> 401", async ({ anon }) => {
    await errorOf(await anon.patch(`/api/org/members/${await userId("viewer")}`, { data: { role: "MANAGER" } }), 401)
  })

  for (const role of ["manager", "verifier", "viewer"] as const) {
    test(`${role} -> 403`, async ({ as }) => {
      await errorOf(await (await as(role)).patch(`/api/org/members/${await userId("viewer")}`, { data: { role: "ADMIN" } }), 403)
    })
  }

  test("admin changes role; persists in list and in fresh login session", async ({ as }) => {
    const api = await as("admin")
    const { member, body } = await invite(api, "VIEWER")
    const updated = await data(await api.patch(`/api/org/members/${member.id}`, { data: { role: "MANAGER" } }))
    expect(updated).toMatchObject({ id: member.id, role: "MANAGER", email: body.email })
    expect(updated.password).toBeUndefined()
    const list = await data<any[]>(await api.get("/api/org/members"))
    expect(list.find((m) => m.id === member.id).role).toBe("MANAGER")
    const { ctx, session } = await loginAs(body.email as string)
    expect(session.user.role).toBe("MANAGER")
    await ctx.dispose()
  })

  test("same role is a no-op 200", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api, "VIEWER")
    const r = await data(await api.patch(`/api/org/members/${member.id}`, { data: { role: "VIEWER" } }))
    expect(r.role).toBe("VIEWER")
  })

  test("member of other org -> 404 and unchanged", async ({ as }) => {
    const { member } = await invite(await as("otherAdmin"), "VIEWER")
    await errorOf(await (await as("admin")).patch(`/api/org/members/${member.id}`, { data: { role: "ADMIN" } }), 404)
    const list = await data<any[]>(await (await as("otherAdmin")).get("/api/org/members"))
    expect(list.find((m) => m.id === member.id).role).toBe("VIEWER")
  })

  test("nonexistent id -> 404", async ({ as }) => {
    await errorOf(await (await as("admin")).patch(`/api/org/members/cdoesnotexist000000`, { data: { role: "VIEWER" } }), 404)
  })

  test("invalid role -> 422", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api)
    const err = await errorOf(await api.patch(`/api/org/members/${member.id}`, { data: { role: "OWNER" } }), 422)
    expect(err.issues!.map((i) => i.path)).toContain("role")
  })

  test("missing role -> 422", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api)
    await errorOf(await api.patch(`/api/org/members/${member.id}`, { data: {} }), 422)
  })

  test("check order: 404 precedes 422 for unknown id + bad body", async ({ as }) => {
    await errorOf(await (await as("admin")).patch(`/api/org/members/cnope00000000000`, { data: { role: "X" } }), 404)
  })

  test("only role is updatable (name/email ignored)", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api)
    const r = await data(await api.patch(`/api/org/members/${member.id}`, { data: { role: "VERIFIER", name: "Hacked", email: "hacked@a.test" } }))
    expect(r.name).toBe(member.name)
    expect(r.email).toBe(member.email)
  })

  test("there is no DELETE endpoint for members", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api)
    const res = await api.delete(`/api/org/members/${member.id}`)
    expect(res.status()).toBe(405)
  })

  test("malformed JSON body returns 400", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api)
    const res = await api.patch(`/api/org/members/${member.id}`, { headers: { "Content-Type": "application/json" }, data: Buffer.from("{oops") })
    expect(res.status()).toBe(400)
  })

  test("sole admin can demote themselves, leaving the org with no admin", async () => {
    const { api, user } = await registerOrg()
    const res = await api.patch(`/api/org/members/${user.id}`, { data: { role: "VIEWER" } })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    await api.dispose()
  })

  test("admin can demote another admin when a second admin remains", async ({ as }) => {
    const api = await as("admin")
    const { member } = await invite(api, "ADMIN")
    const r = await data(await api.patch(`/api/org/members/${member.id}`, { data: { role: "VIEWER" } }))
    expect(r.role).toBe("VIEWER")
  })
})
