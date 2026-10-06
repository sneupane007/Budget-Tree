import { test, expect, createProject } from "../fixtures"

test.describe("response envelope {data,error}", () => {
  test("success responses: error is null", async ({ as }) => {
    const api = await as("admin")
    for (const url of ["/api/projects", "/api/dashboard"]) {
      const res = await api.get(url)
      expect(res.headers()["content-type"]).toContain("application/json")
      const body = await res.json()
      expect(Object.keys(body).sort()).toEqual(["data", "error"])
      expect(body.error).toBeNull()
      expect(body.data).not.toBeNull()
    }
  })

  test("201 create keeps envelope", async ({ as }) => {
    const api = await as("admin")
    const res = await api.post("/api/projects", { data: { name: "Env proj", totalBudget: "10.00", currency: "USD" } })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data.id).toBeTruthy()
  })

  test("404 error: data null, error string", async ({ as }) => {
    const api = await as("admin")
    const res = await api.get("/api/projects/does-not-exist")
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ data: null, error: "Project not found" })
  })

  test("422 validation error: includes issues[] with path/message", async ({ as }) => {
    const api = await as("admin")
    const res = await api.post("/api/projects", { data: { name: "x", totalBudget: "-1", currency: "USD" } })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.data).toBeNull()
    expect(body.error).toBe("Validation failed")
    expect(Array.isArray(body.issues)).toBe(true)
    expect(body.issues[0]).toEqual({ path: expect.any(String), message: expect.any(String) })
    expect(body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(["name", "totalBudget"]))
  })

  test("403 error keeps envelope (viewer cannot patch node)", async ({ as }) => {
    const admin = await as("admin")
    const { rootId } = await createProject(admin)
    const viewer = await as("viewer")
    const res = await viewer.patch(`/api/nodes/${rootId}`, { data: { name: "zz" } })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.data).toBeNull()
    expect(typeof body.error).toBe("string")
  })

  test("malformed JSON body gives a JSON envelope (observe status)", async ({ as }) => {
    const api = await as("admin")
    const res = await api.post("/api/projects", { headers: { "content-type": "application/json" }, data: Buffer.from("{not json") })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.data).toBeNull()
    expect(typeof body.error).toBe("string")
  })

  test("unauthenticated API call: proxy redirect, not envelope", async ({ anon }) => {
    const res = await anon.get("/api/projects", { maxRedirects: 0 })
    expect([307, 302, 401]).toContain(res.status())
  })
})
