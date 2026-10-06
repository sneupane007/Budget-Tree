import {
  test, expect, data, errorOf, createProject, createNode, userId, cacheKeys, flushCache,
} from "../fixtures"
import { getPool } from "../helpers/db"

async function nodeRow(id: string) {
  const { rows } = await getPool().query(`SELECT "spentAmount"::text AS spent, status FROM "BudgetNode" WHERE id=$1`, [id])
  return rows[0] as { spent: string; status: string }
}
async function auditActions(id: string) {
  const { rows } = await getPool().query(`SELECT action FROM "AuditLog" WHERE "nodeId"=$1 ORDER BY timestamp`, [id])
  return rows.map((r) => r.action as string)
}

test.describe("POST /api/nodes/[id]/spend", () => {
  test("root spend updates spentAmount, status IN_PROGRESS, audit SPEND_RECORDED", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    const out = await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "25.50", note: "lunch" } }))
    expect(out.spentAmount).toBe("25.5")
    expect(out.status).toBe("IN_PROGRESS")
    expect(await nodeRow(rootId)).toEqual({ spent: "25.50", status: "IN_PROGRESS" })
    expect(await auditActions(rootId)).toContain("SPEND_RECORDED")
  })

  test("spends accumulate", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "10.10" } }))
    await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "0.20" } }))
    expect((await nodeRow(rootId)).spent).toBe("10.30")
  })

  test("exceeding allocation flips to OVERSPENT; exactly equal does not", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "100.00")
    await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "100.00" } }))
    expect((await nodeRow(rootId)).status).toBe("IN_PROGRESS")
    await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "0.01" } }))
    expect((await nodeRow(rootId)).status).toBe("OVERSPENT")
  })

  for (const amount of ["0", "-5", "abc", ""]) {
    test(`invalid amount ${JSON.stringify(amount)} rejected with 422`, async ({ as }) => {
      const api = await as("admin")
      const { rootId } = await createProject(api)
      await errorOf(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount } }), 422)
      expect((await nodeRow(rootId)).spent).toBe("0.00")
    })
  }

  test("missing/numeric amount rejected with 422", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await errorOf(await api.post(`/api/nodes/${rootId}/spend`, { data: {} }), 422)
    await errorOf(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: 5 } }), 422)
  })

  test("unauthenticated is rejected (redirect/401) and nothing changes", async ({ as, anon }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    // proxy.ts (next-auth withAuth) redirects unauthenticated API calls to /login instead of returning 401
    const res = await anon.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1" }, maxRedirects: 0 })
    expect([301, 302, 307, 308, 401]).toContain(res.status())
    expect((await nodeRow(rootId)).spent).toBe("0.00")
  })

  test("unknown node -> 404 and cross-org node -> 404", async ({ as }) => {
    const api = await as("admin")
    const other = await as("otherAdmin")
    const { rootId } = await createProject(api)
    await errorOf(await api.post(`/api/nodes/cnonexistent000000000000/spend`, { data: { amount: "1" } }), 404)
    await errorOf(await other.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1" } }), 404)
    expect((await nodeRow(rootId)).spent).toBe("0.00")
  })

  test("spend invalidates the node's own cache", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await data(await api.get(`/api/nodes/${rootId}`))
    await data(await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "5.00" } }))
    const n = await data(await api.get(`/api/nodes/${rootId}`))
    expect(n.spentAmount).toBe("5")
  })

  // ---- suspected bugs -------------------------------------------------
  test("VIEWER must not be able to record spend (403)", async ({ as }) => {
    const admin = await as("admin")
    const viewer = await as("viewer")
    const { rootId } = await createProject(admin)
    await errorOf(await viewer.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1.00" } }), 403)
  })

  test("spend must not reset a VERIFIED node to IN_PROGRESS", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    await getPool().query(`UPDATE "BudgetNode" SET status='VERIFIED' WHERE id=$1`, [rootId])
    await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1.00" } })
    expect((await nodeRow(rootId)).status).toBe("VERIFIED")
  })

  test("spend must not reset PENDING_VERIFICATION node to IN_PROGRESS", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    await getPool().query(`UPDATE "BudgetNode" SET status='PENDING_VERIFICATION' WHERE id=$1`, [rootId])
    await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1.00" } })
    expect((await nodeRow(rootId)).status).toBe("PENDING_VERIFICATION")
  })

  test("5 concurrent spends of 10.00 total 50.00 (no lost updates)", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    await Promise.all(
      Array.from({ length: 5 }, () => api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "10.00" } }))
    )
    expect((await nodeRow(rootId)).spent).toBe("50.00")
  })

  test("spending on a child must invalidate ancestor node caches", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    const child = await createNode(api, rootId, "500.00", await userId("admin"))
    await data(await api.get(`/api/nodes/${rootId}`)) // warm cache
    await api.post(`/api/nodes/${child.id}/spend`, { data: { amount: "20.00" } })
    const root = await data(await api.get(`/api/nodes/${rootId}`))
    expect(Number(root.spentAmount)).toBe(20)
  })
})
