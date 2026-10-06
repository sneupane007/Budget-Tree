import { test, expect, data, errorOf, createProject, createNode, userId, registerOrg, uniq } from "../fixtures"

async function setup(as: any) {
  const api = await as("admin")
  const adminId = await userId("admin")
  const { rootId, projectId } = await createProject(api, "1000000.00")
  const node = await createNode(api, rootId, "50000.00", adminId)
  return { api, adminId, rootId, projectId, node }
}

test.describe("GET /api/audit/[nodeId]", () => {
  test("new node has one NODE_CREATED entry; shape {items,nextCursor,hasMore}", async ({ as }) => {
    const { api, node, adminId } = await setup(as)
    const res = await api.get(`/api/audit/${node.id}`)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(["data", "error"])
    const d = await data(await api.get(`/api/audit/${node.id}`))
    expect(d.hasMore).toBe(false)
    expect(d.nextCursor).toBeNull()
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ action: "NODE_CREATED", nodeId: node.id, userId: adminId })
    expect(d.items[0].user).toMatchObject({ id: adminId, email: "admin@a.test" })
  })

  test("entries appear newest-first for create, allocate, status change", async ({ as }) => {
    const { api, node } = await setup(as)
    await data(await api.patch(`/api/nodes/${node.id}/allocate`, { data: { allocatedAmount: "60000.00", reason: "more" } }))
    await data(await api.patch(`/api/nodes/${node.id}/status`, { data: { status: "IN_PROGRESS" } }))
    const d = await data(await api.get(`/api/audit/${node.id}`))
    expect(d.items.map((i: any) => i.action)).toEqual(["STATUS_CHANGED", "BUDGET_AMENDED", "NODE_CREATED"])
    expect(d.items[0].newValue.status).toBe("IN_PROGRESS")
    expect(d.items[0].oldValue.status).toBe("PLANNED")
    expect(d.items[1].oldValue.allocatedAmount).toBe("50000")
  })

  test("audit cache is invalidated by allocate (new entry visible right after a cached read)", async ({ as }) => {
    const { api, node } = await setup(as)
    const before = await data(await api.get(`/api/audit/${node.id}`))
    expect(before.items).toHaveLength(1)
    await data(await api.patch(`/api/nodes/${node.id}/allocate`, { data: { allocatedAmount: "51000.00" } }))
    const after = await data(await api.get(`/api/audit/${node.id}`))
    expect(after.items).toHaveLength(2)
  })

  test("pagination: 20 per page, nextCursor, second page, no overlap", async ({ as }) => {
    const { api, node } = await setup(as)
    for (let i = 0; i < 22; i++) {
      await data(await api.patch(`/api/nodes/${node.id}/allocate`, { data: { allocatedAmount: `${50001 + i}.00` } }))
    }
    // 1 create + 22 amendments = 23
    const p1 = await data(await api.get(`/api/audit/${node.id}`))
    expect(p1.items).toHaveLength(20)
    expect(p1.hasMore).toBe(true)
    expect(p1.nextCursor).toBe(p1.items[19].id)
    const p2 = await data(await api.get(`/api/audit/${node.id}?cursor=${p1.nextCursor}`))
    expect(p2.items).toHaveLength(3)
    expect(p2.hasMore).toBe(false)
    expect(p2.nextCursor).toBeNull()
    const ids = [...p1.items, ...p2.items].map((i: any) => i.id)
    expect(new Set(ids).size).toBe(23)
    expect(p2.items[2].action).toBe("NODE_CREATED")
    const ts = [...p1.items, ...p2.items].map((i: any) => Date.parse(i.timestamp))
    expect([...ts].sort((a, b) => b - a)).toEqual(ts)
  })

  test("exactly 20 entries: hasMore false, no nextCursor", async ({ as }) => {
    const { api, node } = await setup(as)
    for (let i = 0; i < 19; i++) {
      await data(await api.patch(`/api/nodes/${node.id}/allocate`, { data: { allocatedAmount: `${50001 + i}.00` } }))
    }
    const p1 = await data(await api.get(`/api/audit/${node.id}`))
    expect(p1.items).toHaveLength(20)
    expect(p1.hasMore).toBe(false)
    expect(p1.nextCursor).toBeNull()
  })

  test("unknown node id -> 404 envelope", async ({ as }) => {
    const api = await as("admin")
    const b = await errorOf(await api.get(`/api/audit/${uniq("nope")}`), 404)
    expect(b.error).toBe("Node not found")
  })

  test("cross-org audit access -> 404", async ({ as }) => {
    const { node } = await setup(as)
    const other = await as("otherAdmin")
    await errorOf(await other.get(`/api/audit/${node.id}`), 404)
  })

  test("404 is not cached: node visible after it is created under same id is N/A; repeated 404 stays 404", async ({ as }) => {
    const other = await as("otherAdmin")
    const id = uniq("ghost")
    await errorOf(await other.get(`/api/audit/${id}`), 404)
    await errorOf(await other.get(`/api/audit/${id}`), 404)
  })

  test("all roles in the org can read audit", async ({ as }) => {
    const { node } = await setup(as)
    for (const r of ["manager", "verifier", "viewer"] as const) {
      const api = await as(r)
      await data(await api.get(`/api/audit/${node.id}`))
    }
  })

  test("unauthenticated -> redirect to login (proxy)", async ({ anon }) => {
    const res = await anon.get("/api/audit/whatever", { maxRedirects: 0 })
    expect([307, 302, 401]).toContain(res.status())
    if (res.status() !== 401) expect(res.headers()["location"]).toContain("/login")
  })

  test("deleted node: audit route returns 404 afterwards (cache invalidated)", async ({ as }) => {
    const { api, node } = await setup(as)
    await data(await api.get(`/api/audit/${node.id}`)) // warm cache
    await data(await api.delete(`/api/nodes/${node.id}`))
    await errorOf(await api.get(`/api/audit/${node.id}`), 404)
  })

  test("unknown cursor id: 500 NOT reproduced; returns 200 with empty page (current behaviour)", async ({ as }) => {
    const { api, node } = await setup(as)
    const res = await api.get(`/api/audit/${node.id}?cursor=does-not-exist`)
    expect(res.status()).toBe(200)
    expect((await res.json()).data).toEqual({ items: [], nextCursor: null, hasMore: false })
  })

  test("cursor belonging to another node's log leaks nothing", async ({ as }) => {
    const { api, node, rootId, adminId } = await setup(as)
    const other = await createNode(api, rootId, "1000.00", adminId)
    const otherLogs = await data(await api.get(`/api/audit/${other.id}`))
    const res = await api.get(`/api/audit/${node.id}?cursor=${otherLogs.items[0].id}`)
    // observe: must never return another node's entries
    if (res.status() === 200) {
      const d = (await res.json()).data
      for (const i of d.items) expect(i.nodeId).toBe(node.id)
    }
  })

  test("fresh org cannot read another org's audit (registerOrg)", async ({ as }) => {
    const { node } = await setup(as)
    const { api } = await registerOrg()
    await errorOf(await api.get(`/api/audit/${node.id}`), 404)
    await api.dispose()
  })
})
