import { test, expect, data, errorOf, createProject, createNode, userId } from "../fixtures"
import { cuid } from "../helpers/db"

async function setup(as: any, total = "1000.00") {
  const admin = await as("admin")
  const { rootId, projectId } = await createProject(admin, total)
  return { admin, rootId, projectId, uid: await userId("admin") }
}
const alloc = (api: any, id: string, allocatedAmount: any, extra: object = {}) =>
  api.patch(`/api/nodes/${id}/allocate`, { data: { allocatedAmount, ...extra } })

test.describe("PATCH /api/nodes/[id]/allocate", () => {
  test("increases and decreases allocation, records audit with reason", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "100.00", uid)
    const up = await data<any>(await alloc(admin, c.id, "200.50", { reason: "Q2 revision" }))
    expect(up.allocatedAmount).toBe("200.5")
    const down = await data<any>(await alloc(admin, c.id, "50"))
    expect(down.allocatedAmount).toBe("50")
    const n = await data<any>(await admin.get(`/api/nodes/${c.id}`))
    const amended = n.auditLogs.filter((a: any) => a.action === "BUDGET_AMENDED")
    expect(amended).toHaveLength(2)
    expect(amended.some((a: any) => a.newValue.reason === "Q2 revision")).toBe(true)
    expect(n.allocatedAmount).toBe("50")
  })

  test("manager can reallocate", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "100.00", uid)
    await data(await alloc(await as("manager"), c.id, "120"))
  })

  test("exact fit to parent's remaining allowed; +0.01 rejected (self excluded from sibling sum)", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "100.00")
    const a = await createNode(admin, rootId, "30.00", uid)
    await createNode(admin, rootId, "20.00", uid)
    // available for a = 100 - 20 = 80
    await data(await alloc(admin, a.id, "80.00"))
    const err = await errorOf(await alloc(admin, a.id, "80.01"), 422)
    expect(err.error).toMatch(/insufficient/i)
  })

  test("decimal exactness: 0.10 + 0.20 sibling fit in 0.30", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "0.30")
    const a = await createNode(admin, rootId, "0.10", uid)
    await createNode(admin, rootId, "0.10", uid)
    await data(await alloc(admin, a.id, "0.20"))
    await errorOf(await alloc(admin, a.id, "0.21"), 422)
  })

  test("cannot go below children's sum; equal to sum is allowed", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "100.00", uid)
    await createNode(admin, c.id, "30.00", uid)
    await createNode(admin, c.id, "20.00", uid)
    const err = await errorOf(await alloc(admin, c.id, "49.99"), 422)
    expect(err.error).toMatch(/less than children/i)
    await data(await alloc(admin, c.id, "50.00"))
  })

  test("root can be reallocated when no parent (no sibling check) and respects children sum", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "100.00")
    await createNode(admin, rootId, "60.00", uid)
    await errorOf(await alloc(admin, rootId, "59"), 422)
    const r = await data<any>(await alloc(admin, rootId, "500"))
    expect(r.allocatedAmount).toBe("500")
  })

  test("root reallocation updates Project.totalBudget", async ({ as }) => {
    const { admin, rootId, projectId } = await setup(as, "100.00")
    await data(await alloc(admin, rootId, "500"))
    const { rows } = await (await import("../helpers/db")).getPool().query(`SELECT "totalBudget"::text t FROM "Project" WHERE id=$1`, [projectId])
    expect(Number(rows[0].t)).toBe(500)
  })

  test("invalidates node + project cache", async ({ as }) => {
    const { admin, rootId, projectId, uid } = await setup(as)
    const c = await createNode(admin, rootId, "100.00", uid)
    await data(await admin.get(`/api/nodes/${c.id}`))
    await data(await alloc(admin, c.id, "150"))
    expect((await data<any>(await admin.get(`/api/nodes/${c.id}`))).allocatedAmount).toBe("150")
    const p = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(p.nodes.find((n: any) => n.id === c.id).allocatedAmount).toBe("150")
  })

  for (const [label, amt] of [["zero", "0"], ["negative", "-3"], ["non-numeric", "abc"], ["number type", 5]] as const) {
    test(`422 on ${label}`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const c = await createNode(admin, rootId, "10.00", uid)
      await errorOf(await alloc(admin, c.id, amt), 422)
    })
  }

  test("'1e3' allocation is rejected", async ({ as }) => {
    const { admin, rootId, uid } = await setup(as, "5000.00")
    const c = await createNode(admin, rootId, "10.00", uid)
    expect((await alloc(admin, c.id, "1e3")).status()).toBe(422)
  })

  for (const role of ["verifier", "viewer"] as const) {
    test(`${role} gets 403`, async ({ as }) => {
      const { admin, rootId, uid } = await setup(as)
      const c = await createNode(admin, rootId, "10.00", uid)
      await errorOf(await alloc(await as(role), c.id, "20"), 403)
    })
  }

  test("404 unknown node", async ({ as }) => {
    await errorOf(await alloc(await as("admin"), cuid(), "20"), 404)
  })
})
