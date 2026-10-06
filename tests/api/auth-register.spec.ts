import { request } from "@playwright/test"
import { test, expect, data, errorOf, uniq } from "../fixtures"
import { APP_URL, PASSWORD } from "../helpers/env"

const valid = () => ({
  name: "Jane Smith", email: `${uniq("r")}@reg.test`, password: PASSWORD, orgName: "Reg Org", orgType: "NGO",
})

async function login(email: string, password = PASSWORD) {
  const ctx = await request.newContext({ baseURL: APP_URL })
  const csrf = await (await ctx.get("/api/auth/csrf")).json()
  await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken: csrf.csrfToken, email, password, json: "true" },
  })
  const session = await (await ctx.get("/api/auth/session")).json()
  return { ctx, session }
}

test.describe("POST /api/register", () => {
  test.setTimeout(120_000)

  test("creates org + ADMIN user, returns 201 without password", async ({ anon }) => {
    const body = valid()
    const user = await data(await anon.post("/api/register", { data: body }), 201)
    expect(user).toMatchObject({ name: body.name, email: body.email, role: "ADMIN" })
    expect(user.id).toBeTruthy()
    expect(user.organizationId).toBeTruthy()
    expect(user.password).toBeUndefined()
  })

  test("new user can log in and session has ADMIN role + org", async ({ anon }) => {
    const body = valid()
    const user = await data(await anon.post("/api/register", { data: body }), 201)
    const { ctx, session } = await login(body.email)
    expect(session.user.role).toBe("ADMIN")
    expect(session.user.organizationId).toBe(user.organizationId)
    await ctx.dispose()
  })

  for (const orgType of ["BUSINESS", "NGO", "GOVERNMENT"]) {
    test(`accepts orgType ${orgType}`, async ({ anon }) => {
      await data(await anon.post("/api/register", { data: { ...valid(), orgType } }), 201)
    })
  }

  test("each registration gets its own organization", async ({ anon }) => {
    const a = await data(await anon.post("/api/register", { data: valid() }), 201)
    const b = await data(await anon.post("/api/register", { data: valid() }), 201)
    expect(a.organizationId).not.toBe(b.organizationId)
  })

  test("duplicate email -> 409", async ({ anon }) => {
    const body = valid()
    await data(await anon.post("/api/register", { data: body }), 201)
    const err = await errorOf(await anon.post("/api/register", { data: { ...body, orgName: "Other" } }), 409)
    expect(err.error).toMatch(/already/i)
  })

  test("duplicate of seeded email -> 409", async ({ anon }) => {
    await errorOf(await anon.post("/api/register", { data: { ...valid(), email: "admin@a.test" } }), 409)
  })

  const cases: [string, Record<string, unknown>, string][] = [
    ["short name", { name: "J" }, "name"],
    ["invalid email", { email: "not-an-email" }, "email"],
    ["short password (7)", { password: "1234567" }, "password"],
    ["short orgName", { orgName: "X" }, "orgName"],
    ["invalid orgType", { orgType: "COMPANY" }, "orgType"],
    ["missing orgType", { orgType: undefined }, "orgType"],
  ]
  for (const [label, patch, path] of cases) {
    test(`422 for ${label}`, async ({ anon }) => {
      const err = await errorOf(await anon.post("/api/register", { data: { ...valid(), ...patch } }), 422)
      expect(err.error).toBe("Validation failed")
      expect(err.issues!.map((i) => i.path)).toContain(path)
    })
  }

  test("empty body -> 422 with an issue per field", async ({ anon }) => {
    const err = await errorOf(await anon.post("/api/register", { data: {} }), 422)
    expect(err.issues!.map((i) => i.path).sort()).toEqual(["email", "name", "orgName", "orgType", "password"])
  })

  test("8-char password is accepted (boundary)", async ({ anon }) => {
    await data(await anon.post("/api/register", { data: { ...valid(), password: "12345678" } }), 201)
  })

  test("cannot self-assign role or org via extra fields", async ({ anon }) => {
    const user = await data(
      await anon.post("/api/register", { data: { ...valid(), role: "VIEWER", organizationId: "c-evil-org-id-000" } }),
      201
    )
    expect(user.role).toBe("ADMIN")
    expect(user.organizationId).not.toBe("c-evil-org-id-000")
  })

  test("malformed JSON body returns 400", async ({ anon }) => {
    const res = await anon.post("/api/register", { headers: { "Content-Type": "application/json" }, data: Buffer.from("{not json") })
    expect(res.status()).toBe(400)
  })

  test("BUG: email is case-sensitive, so Mixed@Case cannot log in as mixed@case", async ({ anon }) => {
    test.fail(true, "BUG: email is case-sensitive, so Mixed@Case cannot log in as mixed@case")
    const base = `${uniq("Case")}@Reg.test`
    await data(await anon.post("/api/register", { data: { ...valid(), email: base } }), 201)
    const { ctx, session } = await login(base.toLowerCase())
    await ctx.dispose()
    expect(session?.user?.email).toBeTruthy()
  })

  test("BUG: duplicate email check is case-sensitive", async ({ anon }) => {
    test.fail(true, "BUG: duplicate email check is case-sensitive")
    const email = `${uniq("dup")}@reg.test`
    await data(await anon.post("/api/register", { data: { ...valid(), email } }), 201)
    const res = await anon.post("/api/register", { data: { ...valid(), email: email.toUpperCase().replace("@REG.TEST", "@reg.test") } })
    expect(res.status()).toBe(409)
  })
})

test.describe("login / session", () => {
  test.setTimeout(120_000)

  test("wrong password gives no session", async () => {
    const { ctx, session } = await login("admin@a.test", "wrong-password")
    expect(session?.user).toBeUndefined()
    await ctx.dispose()
  })

  test("unknown email gives no session", async () => {
    const { ctx, session } = await login(`${uniq("nobody")}@a.test`)
    expect(session?.user).toBeUndefined()
    await ctx.dispose()
  })

  test("valid login yields session with id, role, organizationId", async () => {
    const { ctx, session } = await login("manager@a.test")
    expect(session.user).toMatchObject({ email: "manager@a.test", role: "MANAGER" })
    expect(session.user.id).toBeTruthy()
    expect(session.user.organizationId).toBeTruthy()
    await ctx.dispose()
  })

  test("anonymous session is empty", async ({ anon }) => {
    expect(await (await anon.get("/api/auth/session")).json()).toEqual({})
  })

  test("session response never exposes password hash", async ({ as }) => {
    const api = await as("admin")
    const text = await (await api.get("/api/auth/session")).text()
    expect(text).not.toMatch(/password|\$2[aby]\$/i)
  })
})
