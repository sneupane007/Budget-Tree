import { test, expect } from "../fixtures"

const PAGES = ["/dashboard", "/projects", "/projects/abc", "/settings"]
const PROTECTED_API = [
  "/api/projects", "/api/projects/abc", "/api/nodes/abc", "/api/receipts/abc",
  "/api/signatures/abc", "/api/audit", "/api/dashboard",
]

test.describe("proxy redirects for anonymous users", () => {
  for (const path of PAGES) {
    test(`GET ${path} -> redirect to /login with callbackUrl`, async ({ anon }) => {
      const res = await anon.get(path, { maxRedirects: 0 })
      expect([302, 303, 307]).toContain(res.status())
      const loc = new URL(res.headers()["location"], "http://localhost:3100")
      expect(loc.pathname).toBe("/login")
      expect(loc.searchParams.get("callbackUrl")).toContain(path)
    })
  }

  for (const path of PROTECTED_API) {
    test(`GET ${path} -> redirect to /login (not JSON 401)`, async ({ anon }) => {
      const res = await anon.get(path, { maxRedirects: 0 })
      expect([302, 303, 307]).toContain(res.status())
      expect(new URL(res.headers()["location"], "http://localhost:3100").pathname).toBe("/login")
    })
  }

  test("POST /api/projects anonymous is redirected, not processed", async ({ anon }) => {
    const res = await anon.post("/api/projects", { data: { name: "x", totalBudget: "1", currency: "USD" }, maxRedirects: 0 })
    expect([302, 303, 307]).toContain(res.status())
  })

  test("/api/org/* is outside the matcher: JSON 401, no redirect", async ({ anon }) => {
    const res = await anon.get("/api/org/members", { maxRedirects: 0 })
    expect(res.status()).toBe(401)
    expect((await res.json()).error).toBe("Unauthorized")
  })
})

test.describe("public routes stay public", () => {
  for (const path of ["/home", "/login", "/register"]) {
    test(`${path} -> 200`, async ({ anon }) => {
      expect((await anon.get(path, { maxRedirects: 0 })).status()).toBe(200)
    })
  }

  test("/api/register is public (422 not redirect)", async ({ anon }) => {
    expect((await anon.post("/api/register", { data: {}, maxRedirects: 0 })).status()).toBe(422)
  })

  test("/ redirects anonymous to /home", async ({ anon }) => {
    const res = await anon.get("/", { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(res.status())
    expect(new URL(res.headers()["location"], "http://localhost:3100").pathname).toBe("/home")
  })
})

test.describe("authenticated access passes the proxy", () => {
  for (const path of PAGES.filter((p) => p !== "/projects/abc")) {
    test(`admin GET ${path} -> 200`, async ({ as }) => {
      const res = await (await as("admin")).get(path, { maxRedirects: 0 })
      expect(res.status()).toBe(200)
    })
  }

  test("viewer GET /api/projects -> 200 JSON", async ({ as }) => {
    const res = await (await as("viewer")).get("/api/projects", { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect((await res.json()).error).toBeNull()
  })

  test("/ redirects logged-in user to /dashboard", async ({ as }) => {
    const res = await (await as("admin")).get("/", { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(res.status())
    expect(new URL(res.headers()["location"], "http://localhost:3100").pathname).toBe("/dashboard")
  })
})

test.describe("tampered credentials", () => {
  test("garbage session cookie is treated as anonymous", async ({ anon }) => {
    const res = await anon.get("/dashboard", {
      maxRedirects: 0,
      headers: { cookie: "next-auth.session-token=garbage.garbage.garbage" },
    })
    expect([302, 303, 307]).toContain(res.status())
  })
})
