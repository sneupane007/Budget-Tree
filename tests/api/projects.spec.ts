import { test, expect, data, errorOf, createProject, createNode, userId, uniq } from "../fixtures"
import { cuid } from "../helpers/db"

test.describe("POST /api/projects", () => {
  test("admin creates project with root node", async ({ as }) => {
    const api = await as("admin")
    const name = uniq("proj")
    const p = await data(await api.post("/api/projects", { data: { name, description: "d", totalBudget: "1234.5", currency: "EUR" } }), 201)
    expect(p.name).toBe(name)
    expect(p.status).toBe("ACTIVE")
    expect(p.currency).toBe("EUR")
    expect(String(p.totalBudget)).toBe("1234.5")
    expect(p.rootNode.isRoot).toBe(true)
    expect(p.rootNode.depth).toBe(0)
    expect(p.rootNode.parentId).toBeNull()
    expect(p.rootNode.status).toBe("PLANNED")
    expect(String(p.rootNode.allocatedAmount)).toBe("1234.5")
  })

  test("manager can create a project too", async ({ as }) => {
    await data(await (await as("manager")).post("/api/projects", { data: { name: uniq("p"), totalBudget: "10", currency: "USD" } }), 201)
  })

  for (const [label, body] of [
    ["name too short", { name: "a", totalBudget: "10", currency: "USD" }],
    ["missing name", { totalBudget: "10", currency: "USD" }],
    ["zero budget", { name: "abc", totalBudget: "0", currency: "USD" }],
    ["negative budget", { name: "abc", totalBudget: "-5", currency: "USD" }],
    ["non-numeric budget", { name: "abc", totalBudget: "abc", currency: "USD" }],
    ["numeric (non-string) budget", { name: "abc", totalBudget: 100, currency: "USD" }],
    ["empty currency", { name: "abc", totalBudget: "10", currency: "" }],
    ["missing currency", { name: "abc", totalBudget: "10" }],
  ] as const) {
    test(`422 on ${label}`, async ({ as }) => {
      const res = await (await as("admin")).post("/api/projects", { data: body })
      const err = await errorOf(res, 422)
      expect(err.error).toBe("Validation failed")
      expect(err.issues!.length).toBeGreaterThan(0)
    })
  }

  test("unauthenticated is redirected to /login", async ({ anon }) => {
    const res = await anon.post("/api/projects", { data: { name: "abc", totalBudget: "1", currency: "USD" }, maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()["location"]).toContain("/login")
  })

  test("decimal budget is stored with 2 decimals exactly", async ({ as }) => {
    const { project, rootId } = await createProject(await as("admin"), "0.30")
    expect(String(project.totalBudget)).toBe("0.3")
    expect(rootId).toBeTruthy()
  })

  // BUG: no role check on project creation
  test("VIEWER cannot create a project (403)", async ({ as }) => {
    const res = await (await as("viewer")).post("/api/projects", { data: { name: uniq("v"), totalBudget: "10", currency: "USD" } })
    expect(res.status()).toBe(403)
  })
})

test.describe("GET /api/projects", () => {
  test("lists own org's projects only, with rootNode and _count", async ({ as }) => {
    const admin = await as("admin")
    const other = await as("otherAdmin")
    const { projectId } = await createProject(admin)
    const { projectId: otherId } = await createProject(other)
    const list = await data<any[]>(await admin.get("/api/projects"))
    const ids = list.map((p) => p.id)
    expect(ids).toContain(projectId)
    expect(ids).not.toContain(otherId)
    const mine = list.find((p) => p.id === projectId)
    expect(mine.rootNode.id).toBeTruthy()
    expect(mine._count.nodes).toBe(1)
  })

  test("every role can list", async ({ as }) => {
    for (const r of ["admin", "manager", "verifier", "viewer"] as const) {
      await data(await (await as(r)).get("/api/projects"))
    }
  })

  test("newly created project appears immediately (create invalidates list cache)", async ({ as }) => {
    const admin = await as("admin")
    await data(await admin.get("/api/projects")) // warm cache
    const { projectId } = await createProject(admin)
    const list = await data<any[]>(await admin.get("/api/projects"))
    expect(list.map((p) => p.id)).toContain(projectId)
  })

  test("unauthenticated redirected", async ({ anon }) => {
    expect((await anon.get("/api/projects", { maxRedirects: 0 })).status()).toBe(307)
  })

  test("node create invalidates project list cache (_count.nodes fresh)", async ({ as }) => {
    const admin = await as("admin")
    const { rootId, projectId } = await createProject(admin)
    const before = (await data<any[]>(await admin.get("/api/projects"))).find((p) => p.id === projectId)
    expect(before._count.nodes).toBe(1)
    await createNode(admin, rootId, "10.00", await userId("admin"))
    const after = (await data<any[]>(await admin.get("/api/projects"))).find((p) => p.id === projectId)
    expect(after._count.nodes).toBe(2)
  })
})

test.describe("GET /api/projects/[id]", () => {
  test("returns project with flat serialized nodes", async ({ as }) => {
    const admin = await as("admin")
    const { rootId, projectId } = await createProject(admin, "500.00")
    const uid = await userId("admin")
    const child = await createNode(admin, rootId, "100.00", uid)
    const gchild = await createNode(admin, child.id, "40.00", uid)
    // fresh project: bypass possibly stale cache by using a different first GET after creation
    const p = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(p.id).toBe(projectId)
    expect(Array.isArray(p.nodes)).toBe(true)
    const byId = Object.fromEntries(p.nodes.map((n: any) => [n.id, n]))
    expect(byId[rootId].allocatedAmount).toBe("500")
    expect(typeof byId[rootId].spentAmount).toBe("string")
    expect(byId[rootId].owner.email).toBeTruthy()
    expect(byId[child.id].depth).toBe(1)
    expect(byId[gchild.id].depth).toBe(2)
    expect(byId[gchild.id].parentId).toBe(child.id)
  })

  test("404 for unknown id", async ({ as }) => {
    await errorOf(await (await as("admin")).get(`/api/projects/${cuid()}`), 404)
  })

  test("404 for non-cuid id too", async ({ as }) => {
    await errorOf(await (await as("admin")).get(`/api/projects/not-a-real-id`), 404)
  })

  test("node create is reflected in subsequent GET (cache invalidated)", async ({ as }) => {
    const admin = await as("admin")
    const { rootId, projectId } = await createProject(admin)
    const first = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(first.nodes).toHaveLength(1)
    await createNode(admin, rootId, "10.00", await userId("admin"))
    const second = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(second.nodes).toHaveLength(2)
  })

  test("node PATCH is reflected in project GET (cache invalidated)", async ({ as }) => {
    const admin = await as("admin")
    const { rootId, projectId } = await createProject(admin)
    const n = await createNode(admin, rootId, "10.00", await userId("admin"))
    await data(await admin.get(`/api/projects/${projectId}`)) // warm
    await data(await admin.patch(`/api/nodes/${n.id}`, { data: { name: "Renamed Node" } }))
    const p = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(p.nodes.find((x: any) => x.id === n.id).name).toBe("Renamed Node")
  })
})

test.describe("PATCH /api/projects/[id]", () => {
  test("updates name/description/status and invalidates cache", async ({ as }) => {
    const admin = await as("admin")
    const { projectId } = await createProject(admin)
    await data(await admin.get(`/api/projects/${projectId}`)) // warm
    const u = await data<any>(await admin.patch(`/api/projects/${projectId}`, { data: { name: "New Name", description: "x", status: "COMPLETED" } }))
    expect(u.name).toBe("New Name")
    expect(u.status).toBe("COMPLETED")
    const g = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(g.name).toBe("New Name")
    expect(g.status).toBe("COMPLETED")
    const list = await data<any[]>(await admin.get("/api/projects"))
    expect(list.find((p) => p.id === projectId).name).toBe("New Name")
  })

  test("manager can patch", async ({ as }) => {
    const { projectId } = await createProject(await as("admin"))
    await data(await (await as("manager")).patch(`/api/projects/${projectId}`, { data: { status: "ARCHIVED" } }))
  })

  for (const [label, body] of [
    ["short name", { name: "a" }],
    ["invalid status", { status: "DONE" }],
  ] as const) {
    test(`422 on ${label}`, async ({ as }) => {
      const admin = await as("admin")
      const { projectId } = await createProject(admin)
      await errorOf(await admin.patch(`/api/projects/${projectId}`, { data: body }), 422)
    })
  }

  test("404 unknown project", async ({ as }) => {
    await errorOf(await (await as("admin")).patch(`/api/projects/${cuid()}`, { data: { name: "abc" } }), 404)
  })

  test("totalBudget is not patchable (ignored)", async ({ as }) => {
    const admin = await as("admin")
    const { projectId } = await createProject(admin, "100.00")
    const u = await data<any>(await admin.patch(`/api/projects/${projectId}`, { data: { totalBudget: "999" } }))
    expect(String(u.totalBudget)).toBe("100")
  })

  test("VIEWER cannot patch a project (403)", async ({ as }) => {
    const { projectId } = await createProject(await as("admin"))
    const res = await (await as("viewer")).patch(`/api/projects/${projectId}`, { data: { name: "hacked" } })
    expect(res.status()).toBe(403)
  })
})
