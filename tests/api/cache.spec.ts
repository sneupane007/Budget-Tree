import { test, expect, data, createProject, createNode, flushCache, cacheKeys, registerOrg, userId } from "../fixtures"

const orgOf = async (api: any) => (await (await api.get("/api/auth/session")).json()).user.organizationId as string

test.describe("cache behaviour", () => {
  test("keys are org-scoped: org:<orgId>:<parts>", async () => {
    await flushCache()
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    const { projectId, rootId } = await createProject(api, "1000.00")
    await data(await api.get("/api/projects"))
    await data(await api.get(`/api/projects/${projectId}`))
    await data(await api.get(`/api/nodes/${rootId}`))
    await data(await api.get(`/api/audit/${rootId}`))
    await data(await api.get("/api/dashboard"))
    const keys = (await cacheKeys()).filter((k) => k.startsWith(`org:${orgId}:`))
    expect(keys).toEqual(expect.arrayContaining([
      `org:${orgId}:projects`,
      `org:${orgId}:projects:${projectId}`,
      `org:${orgId}:nodes:${rootId}`,
      `org:${orgId}:audit:${rootId}:first`,
      `org:${orgId}:dashboard`,
    ]))
    await api.dispose()
  })

  test("cached GET is served from cache (second read unaffected by direct DB edit-free state)", async () => {
    await flushCache()
    const { api } = await registerOrg()
    await createProject(api, "1000.00")
    const a = await data(await api.get("/api/projects"))
    const b = await data(await api.get("/api/projects"))
    expect(b).toEqual(a)
  })

  test("flushCache then read repopulates", async () => {
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    await createProject(api, "10.00")
    await data(await api.get("/api/projects"))
    await flushCache()
    expect((await cacheKeys()).filter((k) => k.startsWith(`org:${orgId}:`))).toEqual([])
    await data(await api.get("/api/projects"))
    expect(await cacheKeys()).toContain(`org:${orgId}:projects`)
    await api.dispose()
  })

  test("project create invalidates projects + dashboard", async () => {
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    await data(await api.get("/api/projects"))
    await data(await api.get("/api/dashboard"))
    await createProject(api, "10.00")
    const keys = await cacheKeys()
    expect(keys).not.toContain(`org:${orgId}:projects`)
    expect(keys).not.toContain(`org:${orgId}:dashboard`)
    expect((await data(await api.get("/api/projects"))).length).toBe(1)
    expect((await data(await api.get("/api/dashboard"))).activeProjects).toBe(1)
    await api.dispose()
  })

  test("project PATCH invalidates project detail and list", async () => {
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    const { projectId } = await createProject(api, "10.00")
    await data(await api.get("/api/projects"))
    await data(await api.get(`/api/projects/${projectId}`))
    await data(await api.patch(`/api/projects/${projectId}`, { data: { name: "Renamed one" } }))
    const keys = await cacheKeys()
    expect(keys).not.toContain(`org:${orgId}:projects`)
    expect(keys).not.toContain(`org:${orgId}:projects:${projectId}`)
    expect((await data(await api.get(`/api/projects/${projectId}`))).name).toBe("Renamed one")
    await api.dispose()
  })

  test("allocate invalidates node, audit, project detail", async () => {
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    const me = await orgMe(api)
    const { projectId, rootId } = await createProject(api, "1000.00")
    const n = await createNode(api, rootId, "100.00", me)
    await data(await api.get(`/api/nodes/${n.id}`))
    await data(await api.get(`/api/audit/${n.id}`))
    await data(await api.get(`/api/projects/${projectId}`))
    await data(await api.patch(`/api/nodes/${n.id}/allocate`, { data: { allocatedAmount: "200.00" } }))
    const keys = await cacheKeys()
    expect(keys).not.toContain(`org:${orgId}:nodes:${n.id}`)
    expect(keys).not.toContain(`org:${orgId}:audit:${n.id}:first`)
    expect(keys).not.toContain(`org:${orgId}:projects:${projectId}`)
    expect((await data(await api.get(`/api/nodes/${n.id}`))).allocatedAmount).toBe("200")
    await api.dispose()
  })

  test("status change invalidates node, dashboard, project detail", async () => {
    const { api } = await registerOrg()
    const orgId = await orgOf(api)
    const me = await orgMe(api)
    const { projectId, rootId } = await createProject(api, "1000.00")
    const n = await createNode(api, rootId, "100.00", me)
    await data(await api.get("/api/dashboard"))
    await data(await api.get(`/api/nodes/${n.id}`))
    await data(await api.get(`/api/projects/${projectId}`))
    await data(await api.patch(`/api/nodes/${n.id}/status`, { data: { status: "IN_PROGRESS" } }))
    const keys = await cacheKeys()
    expect(keys).not.toContain(`org:${orgId}:dashboard`)
    expect(keys).not.toContain(`org:${orgId}:nodes:${n.id}`)
    expect(keys).not.toContain(`org:${orgId}:projects:${projectId}`)
    const d = await data(await api.get("/api/dashboard"))
    expect(d.nodesByStatus.IN_PROGRESS).toBe(1)
    await api.dispose()
  })

  test("cache is per-org: same route different orgs do not share entries", async ({ as }) => {
    await flushCache()
    const a = await as("admin")
    const b = await as("otherAdmin")
    await createProject(a, "10.00", "OnlyInA-" + Date.now())
    const la = await data(await a.get("/api/projects"))
    const lb = await data(await b.get("/api/projects"))
    expect(lb.some((p: any) => la.find((x: any) => x.id === p.id))).toBe(false)
  })

  // ── suspected stale-cache bugs ────────────────────────────────────
  test("allocate on the root invalidates the dashboard", async () => {
    const { api } = await registerOrg()
    const { rootId } = await createProject(api, "10000.00")
    const before = await data(await api.get("/api/dashboard"))
    expect(before.totalBudget).toBe("10000")
    await data(await api.patch(`/api/nodes/${rootId}/allocate`, { data: { allocatedAmount: "12000.00" } }))
    const after = await data(await api.get("/api/dashboard"))
    expect(after.totalBudget).toBe("12000")
    await api.dispose()
  })

  test("node delete invalidates the dashboard", async () => {
    const { api } = await registerOrg()
    const me = await orgMe(api)
    const { rootId } = await createProject(api, "10000.00")
    const n = await createNode(api, rootId, "1000.00", me)
    const before = await data(await api.get("/api/dashboard"))
    expect(before.nodesByStatus.PLANNED).toBe(2)
    await data(await api.delete(`/api/nodes/${n.id}`))
    const after = await data(await api.get("/api/dashboard"))
    expect(after.nodesByStatus.PLANNED).toBe(1)
    await api.dispose()
  })

  test("project ACTIVE -> ARCHIVED invalidates dashboard activeProjects", async () => {
    const { api } = await registerOrg()
    const { projectId } = await createProject(api, "10000.00")
    expect((await data(await api.get("/api/dashboard"))).activeProjects).toBe(1)
    await data(await api.patch(`/api/projects/${projectId}`, { data: { status: "ARCHIVED" } }))
    expect((await data(await api.get("/api/dashboard"))).activeProjects).toBe(0)
    await api.dispose()
  })

  test("node create invalidates the project detail cache", async () => {
    const { api } = await registerOrg()
    const me = await orgMe(api)
    const { projectId, rootId } = await createProject(api, "10000.00")
    expect((await data(await api.get(`/api/projects/${projectId}`))).nodes).toHaveLength(1)
    await createNode(api, rootId, "1000.00", me)
    expect((await data(await api.get(`/api/projects/${projectId}`))).nodes).toHaveLength(2)
    await api.dispose()
  })

  test("node create invalidates the projects list (_count.nodes)", async () => {
    const { api } = await registerOrg()
    const me = await orgMe(api)
    const { rootId } = await createProject(api, "10000.00")
    expect((await data(await api.get("/api/projects")))[0]._count.nodes).toBe(1)
    await createNode(api, rootId, "1000.00", me)
    expect((await data(await api.get("/api/projects")))[0]._count.nodes).toBe(2)
    await api.dispose()
  })

  test("node create invalidates the parent node and dashboard", async () => {
    const { api } = await registerOrg()
    const me = await orgMe(api)
    const { rootId } = await createProject(api, "10000.00")
    expect((await data(await api.get(`/api/nodes/${rootId}`))).children).toHaveLength(0)
    await data(await api.get("/api/dashboard"))
    await createNode(api, rootId, "1000.00", me)
    expect((await data(await api.get(`/api/nodes/${rootId}`))).children).toHaveLength(1)
    expect((await data(await api.get("/api/dashboard"))).nodesByStatus.PLANNED).toBe(2)
    await api.dispose()
  })

  test.skip("Redis outage must not 500 cached GETs (cannot kill the fake Redis from a test)", () => {})
})

async function orgMe(api: any) {
  return (await (await api.get("/api/auth/session")).json()).user.id as string
}
