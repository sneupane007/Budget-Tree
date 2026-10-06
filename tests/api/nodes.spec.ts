import { test, expect, data, errorOf, createProject, createNode, userId, uniq } from "../fixtures"
import { cuid } from "../helpers/db"

async function setup(as: any, total = "1000.00") {
  const admin = await as("admin")
  const { rootId, projectId } = await createProject(admin, total)
  return { admin, rootId, projectId, uid: await userId("admin") }
}
const body = (parentId: string, ownerId: string, allocatedAmount = "10.00", extra: object = {}) => ({
  name: uniq("n"), allocatedAmount, currency: "USD", parentId, ownerId, ...extra,
})

test.describe("POST /api/nodes", () => {
  test("creates a child with depth, status, serialized amounts", async ({ as }) => {
    const { admin, rootId, projectId, uid } = await setup(as)
    const c = await data<any>(await admin.post("/api/nodes", { data: body(rootId, uid, "250.5", { description: "hi" }) }), 201)
    expect(c.depth).toBe(1)
    expect(c.projectId).toBe(projectId)
    expect(c.parentId).toBe(rootId)
    expect(c.status).toBe("PLANNED")
    expect(c.isRoot).toBe(false)
    expect(c.allocatedAmount).toBe("250.5")
    expect(c.spentAmount).toBe("0")
    expect(c.owner.id).toBe(uid)
  })

  test("grandchild has depth 2", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "100.00", uid)
    const g = await createNode(admin, c.id, "50.00", uid)
    expect(g.depth).toBe(2)
  })

  test("manager can create nodes", async ({ as }) => {
    const { rootId, uid } = await setup(as)
    await createNode(await as("manager"), rootId, "5.00", uid)
  })

  for (const [label, mut] of [
    ["short name", { name: "a" }],
    ["zero amount", { allocatedAmount: "0" }],
    ["negative amount", { allocatedAmount: "-1" }],
    ["non-numeric amount", { allocatedAmount: "abc" }],
    ["numeric amount", { allocatedAmount: 10 }],
    ["empty currency", { currency: "" }],
    ["non-cuid parentId", { parentId: "nope" }],
    ["non-cuid ownerId", { ownerId: "nope" }],
  ] as const) {
    test(`422 on ${label}`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const err = await errorOf(await admin.post("/api/nodes", { data: { ...body(rootId, uid), ...mut } }), 422)
      expect(err.error).toBe("Validation failed")
    })
  }

  test("404 unknown parent", async ({ as }) => {
    const { admin, uid } = await setup(as)
    await errorOf(await admin.post("/api/nodes", { data: body(cuid(), uid) }), 404)
  })

  test("404 owner from another org", async ({ as }) => {
    const { admin, rootId } = await setup(as)
    const err = await errorOf(await admin.post("/api/nodes", { data: body(rootId, await userId("otherAdmin")) }), 404)
    expect(err.error).toMatch(/owner/i)
  })

  test("404 unknown owner cuid", async ({ as }) => {
    const { admin, rootId } = await setup(as)
    await errorOf(await admin.post("/api/nodes", { data: body(rootId, cuid()) }), 404)
  })

  test("404 parent in another org", async ({ as }) => {
    const { rootId } = await setup(as)
    const other = await as("otherAdmin")
    await errorOf(await other.post("/api/nodes", { data: body(rootId, await userId("otherAdmin")) }), 404)
  })

  test("unauthenticated redirected", async ({ anon }) => {
    expect((await anon.post("/api/nodes", { data: {}, maxRedirects: 0 })).status()).toBe(307)
  })

  test.describe("budget rules", () => {
    test("422 insufficient when exceeding parent", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "100.00")
      const err = await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "100.01") }), 422)
      expect(err.error).toMatch(/insufficient/i)
    })

    test("exact fit allowed, then +0.01 rejected", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "100.00")
      await createNode(admin, rootId, "60.00", uid)
      await createNode(admin, rootId, "40.00", uid)
      const err = await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "0.01") }), 422)
      expect(err.error).toMatch(/insufficient/i)
    })

    test("sibling sum is enforced (60 + 40.01 rejected)", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "100.00")
      await createNode(admin, rootId, "60.00", uid)
      await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "40.01") }), 422)
    })

    test("decimal exactness: 0.10 + 0.20 fits exactly in 0.30", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "0.30")
      await createNode(admin, rootId, "0.10", uid)
      await createNode(admin, rootId, "0.20", uid)
      await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "0.01") }), 422)
    })

    test("child cannot exceed its own parent (not root) budget", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "1000.00")
      const c = await createNode(admin, rootId, "100.00", uid)
      await errorOf(await admin.post("/api/nodes", { data: body(c.id, uid, "100.01") }), 422)
      await createNode(admin, c.id, "100.00", uid)
    })

    test("amounts with more than 2 decimals are rejected; 2 decimals are stored exactly", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "10.126") }), 422)
      const c = await createNode(admin, rootId, "10.13", uid)
      expect(c.allocatedAmount).toBe("10.13")
    })

    test("scientific notation amount '1e3' is rejected", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "5000.00")
      const res = await admin.post("/api/nodes", { data: body(rootId, uid, "1e3") })
      expect(res.status()).toBe(422)
    })

    test("concurrent creates cannot jointly exceed parent budget", async ({ as }) => {
      const { admin, rootId, uid } = await setup(as, "100.00")
      const results = await Promise.all(
        Array.from({ length: 6 }, () => admin.post("/api/nodes", { data: body(rootId, uid, "50.00") }))
      )
      const ok = results.filter((r) => r.status() === 201).length
      expect(ok).toBeLessThanOrEqual(2)
    })
  })

  test("VIEWER cannot create nodes (403)", async ({ as }) => {
    const { rootId, uid } = await setup(as)
    const res = await (await as("viewer")).post("/api/nodes", { data: body(rootId, uid) })
    expect(res.status()).toBe(403)
  })
})

test.describe("GET /api/nodes/[id]", () => {
  test("returns node with owner, children, receipts, signatures, auditLogs", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "300.00")
    const c = await createNode(admin, rootId, "100.00", uid)
    const g = await createNode(admin, c.id, "10.00", uid)
    const n = await data<any>(await admin.get(`/api/nodes/${c.id}`))
    expect(n.id).toBe(c.id)
    expect(n.allocatedAmount).toBe("100")
    expect(n.owner.id).toBe(uid)
    expect(n.children.map((x: any) => x.id)).toEqual([g.id])
    expect(n.children[0].allocatedAmount).toBe("10")
    expect(n.receipts).toEqual([])
    expect(n.signatures).toEqual([])
    expect(n.auditLogs.map((a: any) => a.action)).toContain("NODE_CREATED")
    expect(n.auditLogs[0].user.email).toBeTruthy()
  })

  test("every role can read a node", async ({ as }) => {
    const { rootId } = await setup(as)
    for (const r of ["manager", "verifier", "viewer"] as const) {
      await data(await (await as(r)).get(`/api/nodes/${rootId}`))
    }
  })

  test("404 unknown", async ({ as }) => {
    await errorOf(await (await as("admin")).get(`/api/nodes/${cuid()}`), 404)
  })
})

test.describe("PATCH /api/nodes/[id]", () => {
  test("updates name/description/owner and writes audit log", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    await data(await admin.get(`/api/nodes/${c.id}`)) // warm cache
    const mgr = await userId("manager")
    const u = await data<any>(await admin.patch(`/api/nodes/${c.id}`, { data: { name: "Renamed", description: "dd", ownerId: mgr } }))
    expect(u.name).toBe("Renamed")
    expect(u.ownerId).toBe(mgr)
    const g = await data<any>(await admin.get(`/api/nodes/${c.id}`))
    expect(g.name).toBe("Renamed")
    expect(g.owner.id).toBe(mgr)
    expect(g.auditLogs.map((a: any) => a.action)).toContain("NODE_UPDATED")
  })

  test("sets approver (same org)", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const ver = await userId("verifier")
    const u = await data<any>(await admin.patch(`/api/nodes/${c.id}`, { data: { approverId: ver } }))
    expect(u.approverId).toBe(ver)
  })

  test("manager can patch", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    await data(await (await as("manager")).patch(`/api/nodes/${c.id}`, { data: { name: "By Manager" } }))
  })

  for (const role of ["verifier", "viewer"] as const) {
    test(`${role} gets 403`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const c = await createNode(admin, rootId, "10.00", uid)
      await errorOf(await (await as(role)).patch(`/api/nodes/${c.id}`, { data: { name: "nope!" } }), 403)
    })
  }

  for (const [label, b] of [
    ["short name", { name: "a" }],
    ["non-cuid ownerId", { ownerId: "x" }],
    ["non-cuid approverId", { approverId: "x" }],
  ] as const) {
    test(`422 on ${label}`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const c = await createNode(admin, rootId, "10.00", uid)
      await errorOf(await admin.patch(`/api/nodes/${c.id}`, { data: b }), 422)
    })
  }

  test("allocatedAmount is not patchable via this route", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const u = await data<any>(await admin.patch(`/api/nodes/${c.id}`, { data: { allocatedAmount: "999" } }))
    expect(u.allocatedAmount).toBe("10")
  })

  test("404 unknown node", async ({ as }) => {
    await errorOf(await (await as("admin")).patch(`/api/nodes/${cuid()}`, { data: { name: "abc" } }), 404)
  })

  test("cross-org ownerId is rejected with 4xx", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const res = await admin.patch(`/api/nodes/${c.id}`, { data: { ownerId: await userId("otherAdmin") } })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test("cross-org approverId is rejected with 4xx", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const res = await admin.patch(`/api/nodes/${c.id}`, { data: { approverId: await userId("otherAdmin") } })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test("nonexistent approverId is rejected with 4xx", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const res = await admin.patch(`/api/nodes/${c.id}`, { data: { approverId: cuid() } })
    expect(res.status()).toBeLessThan(500)
  })
})

test.describe("DELETE /api/nodes/[id]", () => {
  test("deletes a leaf PLANNED node; gone afterwards; project GET no longer lists it", async ({ as }) => {
    const { admin, rootId, projectId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    const r = await data<any>(await admin.delete(`/api/nodes/${c.id}`))
    expect(r.deleted).toBe(true)
    await errorOf(await admin.get(`/api/nodes/${c.id}`), 404)
    const p = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(p.nodes.map((n: any) => n.id)).not.toContain(c.id)
  })

  test("deleting frees budget for siblings", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "100.00")
    const a = await createNode(admin, rootId, "100.00", uid)
    await errorOf(await admin.post("/api/nodes", { data: body(rootId, uid, "1.00") }), 422)
    await data(await admin.delete(`/api/nodes/${a.id}`))
    await createNode(admin, rootId, "100.00", uid)
  })

  test("manager can delete", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    await data(await (await as("manager")).delete(`/api/nodes/${c.id}`))
  })

  test("400 with children", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    await createNode(admin, c.id, "5.00", uid)
    const err = await errorOf(await admin.delete(`/api/nodes/${c.id}`), 400)
    expect(err.error).toMatch(/children/i)
  })

  test("400 when not PLANNED", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "10.00", uid)
    await data(await admin.patch(`/api/nodes/${c.id}/status`, { data: { status: "IN_PROGRESS" } }))
    const err = await errorOf(await admin.delete(`/api/nodes/${c.id}`), 400)
    expect(err.error).toMatch(/PLANNED/)
  })

  test("400 on root (no children)", async ({ as }) => {
    const { admin, rootId } = await setup(as)
    const err = await errorOf(await admin.delete(`/api/nodes/${rootId}`), 400)
    expect(err.error).toMatch(/root/i)
  })

  for (const role of ["verifier", "viewer"] as const) {
    test(`${role} gets 403`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const c = await createNode(admin, rootId, "10.00", uid)
      await errorOf(await (await as(role)).delete(`/api/nodes/${c.id}`), 403)
    })
  }

  test("404 unknown", async ({ as }) => {
    await errorOf(await (await as("admin")).delete(`/api/nodes/${cuid()}`), 404)
  })
})
