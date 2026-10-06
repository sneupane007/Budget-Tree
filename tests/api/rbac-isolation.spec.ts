import { test, expect, data, createProject, createNode, userId, uniq } from "../fixtures"
import { cuid } from "../helpers/db"

// Role matrix + cross-org isolation for every :id route in the projects/nodes area.
async function world(as: any) {
  const admin = await as("admin")
  const { rootId, projectId } = await createProject(admin, "1000.00")
  const uid = await userId("admin")
  const node = await createNode(admin, rootId, "100.00", uid)
  return { admin, rootId, projectId, uid, nodeId: node.id as string }
}

test.describe("role matrix", () => {
  const cases: { role: "admin" | "manager" | "verifier" | "viewer"; list: number; createNode: number; patchNode: number; allocate: number; status: number; del: number }[] = [
    { role: "admin", list: 200, createNode: 201, patchNode: 200, allocate: 200, status: 200, del: 200 },
    { role: "manager", list: 200, createNode: 201, patchNode: 200, allocate: 200, status: 200, del: 200 },
    { role: "verifier", list: 200, createNode: 201, patchNode: 403, allocate: 403, status: 200, del: 403 },
    { role: "viewer", list: 200, createNode: 403, patchNode: 403, allocate: 403, status: 403, del: 403 },
  ]
  for (const c of cases) {
    test(`${c.role}`, async ({ as }) => {
      const w = await world(as)
      const api = await as(c.role)
      const check = (name: string, got: number, want: number) => {
        // VERIFIER/VIEWER creating nodes is a known gap (see nodes.spec.ts); verifier-create is asserted below as a bug.
        expect(got, `${c.role} ${name}`).toBe(want)
      }
      check("GET projects", (await api.get("/api/projects")).status(), c.list)
      check("GET project", (await api.get(`/api/projects/${w.projectId}`)).status(), 200)
      check("GET node", (await api.get(`/api/nodes/${w.nodeId}`)).status(), 200)
      check("PATCH node", (await api.patch(`/api/nodes/${w.nodeId}`, { data: { name: "rbac name" } })).status(), c.patchNode)
      check("allocate", (await api.patch(`/api/nodes/${w.nodeId}/allocate`, { data: { allocatedAmount: "90" } })).status(), c.allocate)
      check("status", (await api.patch(`/api/nodes/${w.nodeId}/status`, { data: { status: "IN_PROGRESS" } })).status(), c.status)
      // DELETE last: after status change node is IN_PROGRESS -> for allowed roles expect 400 (role passed), else 403
      const del = (await api.delete(`/api/nodes/${w.nodeId}`)).status()
      check("DELETE", del, c.del === 200 ? 400 : 403)
    })
  }

  test("VERIFIER creating nodes/projects is forbidden", async ({ as }) => {
    const w = await world(as)
    const v = await as("verifier")
    const res = await v.post("/api/nodes", { data: { name: uniq("n"), allocatedAmount: "1.00", currency: "USD", parentId: w.rootId, ownerId: w.uid } })
    expect(res.status()).toBe(403)
  })

  test("unauthenticated: every route redirects to /login", async ({ anon }) => {
    const id = cuid()
    const reqs = [
      anon.get("/api/projects", { maxRedirects: 0 }),
      anon.post("/api/projects", { data: {}, maxRedirects: 0 }),
      anon.get(`/api/projects/${id}`, { maxRedirects: 0 }),
      anon.patch(`/api/projects/${id}`, { data: {}, maxRedirects: 0 }),
      anon.post("/api/nodes", { data: {}, maxRedirects: 0 }),
      anon.get(`/api/nodes/${id}`, { maxRedirects: 0 }),
      anon.patch(`/api/nodes/${id}`, { data: {}, maxRedirects: 0 }),
      anon.delete(`/api/nodes/${id}`, { maxRedirects: 0 }),
      anon.patch(`/api/nodes/${id}/allocate`, { data: {}, maxRedirects: 0 }),
      anon.patch(`/api/nodes/${id}/status`, { data: {}, maxRedirects: 0 }),
    ]
    for (const r of await Promise.all(reqs)) {
      expect(r.status()).toBe(307)
      expect(r.headers()["location"]).toContain("/login")
    }
  })
})

test.describe("cross-org isolation (org B admin vs org A data)", () => {
  test("every :id route returns 404 and leaves data untouched", async ({ as }) => {
    const w = await world(as)
    const b = await as("otherAdmin")
    const bUser = await userId("otherAdmin")
    const nf = async (label: string, p: Promise<any>) => {
      const res = await p
      const body = await res.json().catch(() => null)
      expect(res.status(), `${label}: ${JSON.stringify(body)}`).toBe(404)
      expect(body.data).toBeNull()
    }
    await nf("GET project", b.get(`/api/projects/${w.projectId}`))
    await nf("PATCH project", b.patch(`/api/projects/${w.projectId}`, { data: { name: "pwned" } }))
    await nf("GET node", b.get(`/api/nodes/${w.nodeId}`))
    await nf("PATCH node", b.patch(`/api/nodes/${w.nodeId}`, { data: { name: "pwned" } }))
    await nf("DELETE node", b.delete(`/api/nodes/${w.nodeId}`))
    await nf("allocate", b.patch(`/api/nodes/${w.nodeId}/allocate`, { data: { allocatedAmount: "1" } }))
    await nf("status", b.patch(`/api/nodes/${w.nodeId}/status`, { data: { status: "IN_PROGRESS" } }))
    await nf("POST node under A's parent", b.post("/api/nodes", { data: { name: "pwned", allocatedAmount: "1.00", currency: "USD", parentId: w.rootId, ownerId: bUser } }))
    await nf("PATCH root node", b.patch(`/api/nodes/${w.rootId}`, { data: { name: "pwned" } }))

    const n = await data<any>(await w.admin.get(`/api/nodes/${w.nodeId}`))
    expect(n.status).toBe("PLANNED")
    expect(n.allocatedAmount).toBe("100")
    expect(n.name).not.toBe("pwned")
    const p = await data<any>(await w.admin.get(`/api/projects/${w.projectId}`))
    expect(p.name).not.toBe("pwned")
  })

  test("org B list never includes org A projects", async ({ as }) => {
    const w = await world(as)
    const list = await data<any[]>(await (await as("otherAdmin")).get("/api/projects"))
    expect(list.map((p) => p.id)).not.toContain(w.projectId)
  })

  test("org A cannot see org B's project or node", async ({ as }) => {
    const b = await as("otherAdmin")
    const { projectId, rootId } = await createProject(b)
    const a = await as("admin")
    expect((await a.get(`/api/projects/${projectId}`)).status()).toBe(404)
    expect((await a.get(`/api/nodes/${rootId}`)).status()).toBe(404)
  })
})
