import { test, expect, data, createProject, createNode, userId } from "../fixtures"
import { getPool } from "../helpers/db"

async function row(id: string) {
  const { rows } = await getPool().query(`SELECT "spentAmount"::text AS spent, status FROM "BudgetNode" WHERE id=$1`, [id])
  return rows[0] as { spent: string; status: string }
}

test.describe("spend rollups (lib/budget/recalculate-rollups.ts)", () => {
  test("child spend succeeds (200) and is persisted", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api, "1000.00")
    const child = await createNode(api, rootId, "500.00", await userId("admin"))
    const out = await data(await api.post(`/api/nodes/${child.id}/spend`, { data: { amount: "10.00" } }))
    expect(out.spentAmount).toBe("10")
    expect((await row(child.id)).spent).toBe("10.00")
  })

  test("child spend rolls up to parent and grandparent", async ({ as }) => {
    const api = await as("admin")
    const owner = await userId("admin")
    const { rootId } = await createProject(api, "1000.00")
    const parent = await createNode(api, rootId, "500.00", owner)
    const child = await createNode(api, parent.id, "200.00", owner)
    await data(await api.post(`/api/nodes/${child.id}/spend`, { data: { amount: "30.00" } }))
    expect((await row(child.id)).spent).toBe("30.00")
    expect((await row(parent.id)).spent).toBe("30.00")
    expect((await row(rootId)).spent).toBe("30.00")
  })

  test("parent spentAmount equals the sum of sibling spends", async ({ as }) => {
    const api = await as("admin")
    const owner = await userId("admin")
    const { rootId } = await createProject(api, "1000.00")
    const parent = await createNode(api, rootId, "500.00", owner)
    const a = await createNode(api, parent.id, "200.00", owner)
    const b = await createNode(api, parent.id, "200.00", owner)
    await data(await api.post(`/api/nodes/${a.id}/spend`, { data: { amount: "30.00" } }))
    await data(await api.post(`/api/nodes/${b.id}/spend`, { data: { amount: "45.50" } }))
    expect((await row(parent.id)).spent).toBe("75.50")
    expect((await row(rootId)).spent).toBe("75.50")
  })

  test("parent flips to OVERSPENT when children spend exceeds its allocation", async ({ as }) => {
    const api = await as("admin")
    const owner = await userId("admin")
    const { rootId } = await createProject(api, "1000.00")
    const parent = await createNode(api, rootId, "100.00", owner)
    const a = await createNode(api, parent.id, "60.00", owner)
    const b = await createNode(api, parent.id, "40.00", owner)
    await data(await api.post(`/api/nodes/${a.id}/spend`, { data: { amount: "60.00" } }))
    await data(await api.post(`/api/nodes/${b.id}/spend`, { data: { amount: "40.00" } }))
    expect((await row(parent.id)).status).not.toBe("OVERSPENT")
    // child b overspends its own allocation -> parent total 101 > 100
    await data(await api.post(`/api/nodes/${b.id}/spend`, { data: { amount: "1.00" } }))
    expect((await row(b.id)).status).toBe("OVERSPENT")
    expect((await row(parent.id)).status).toBe("OVERSPENT")
  })

  test("a parent's own direct spend is not wiped by the rollup", async ({ as }) => {
    const api = await as("admin")
    const owner = await userId("admin")
    const { rootId } = await createProject(api, "1000.00")
    const parent = await createNode(api, rootId, "500.00", owner)
    const child = await createNode(api, parent.id, "200.00", owner)
    await data(await api.post(`/api/nodes/${parent.id}/spend`, { data: { amount: "100.00" } }))
    await data(await api.post(`/api/nodes/${child.id}/spend`, { data: { amount: "30.00" } }))
    expect((await row(parent.id)).spent).toBe("130.00")
  })
  test("concurrent spends on a parent, its children and the root neither deadlock nor lose updates", async ({ as }) => {
    const api = await as("admin")
    const owner = await userId("admin")
    const { rootId } = await createProject(api, "10000.00")
    const parent = await createNode(api, rootId, "5000.00", owner)
    const a = await createNode(api, parent.id, "1000.00", owner)
    const b = await createNode(api, parent.id, "1000.00", owner)
    const targets = [a.id, b.id, parent.id, rootId, a.id, b.id, parent.id, a.id]
    const results = await Promise.all(
      targets.map((id) => api.post(`/api/nodes/${id}/spend`, { data: { amount: "10.00" } }))
    )
    expect(results.map((r) => r.status())).toEqual(targets.map(() => 200))
    expect((await row(a.id)).spent).toBe("30.00")
    expect((await row(b.id)).spent).toBe("20.00")
    // parent: 2 direct + 5 from children (a x3, b x2)
    expect((await row(parent.id)).spent).toBe("70.00")
    // root: 1 direct + 7 from below
    expect((await row(rootId)).spent).toBe("80.00")
  })
})
