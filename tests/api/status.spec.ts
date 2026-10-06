import { test, expect, data, errorOf, createProject, createNode, userId } from "../fixtures"
import { cuid, getPool } from "../helpers/db"

async function setup(as: any) {
  const admin = await as("admin")
  const { rootId, projectId } = await createProject(admin, "1000.00")
  const c = await createNode(admin, rootId, "100.00", await userId("admin"))
  return { admin, rootId, projectId, id: c.id as string }
}
const setStatus = (api: any, id: string, status: string, note?: string) =>
  api.patch(`/api/nodes/${id}/status`, { data: { status, note } })

// Mirrors VALID_TRANSITIONS in app/api/nodes/[id]/status/route.ts
const MAP: Record<string, string[]> = {
  PLANNED: ["IN_PROGRESS", "FLAGGED"],
  IN_PROGRESS: ["PENDING_VERIFICATION", "FLAGGED", "PLANNED"],
  PENDING_VERIFICATION: ["VERIFIED", "IN_PROGRESS", "FLAGGED"],
  VERIFIED: ["IN_PROGRESS"],
  FLAGGED: ["IN_PROGRESS", "PLANNED"],
  OVERSPENT: ["FLAGGED"],
}
const PATH: Record<string, string[]> = {
  PLANNED: [],
  IN_PROGRESS: ["IN_PROGRESS"],
  PENDING_VERIFICATION: ["IN_PROGRESS", "PENDING_VERIFICATION"],
  VERIFIED: ["IN_PROGRESS", "PENDING_VERIFICATION", "VERIFIED"],
  FLAGGED: ["FLAGGED"],
  OVERSPENT: [], // forced via DB (only /spend produces it)
}
const ALL = ["PLANNED", "IN_PROGRESS", "PENDING_VERIFICATION", "VERIFIED", "FLAGGED", "OVERSPENT"]

test.describe("status transition matrix", () => {
  for (const from of ALL) {
    for (const to of ALL) {
      const ok = MAP[from].includes(to)
      test(`${from} -> ${to} ${ok ? "allowed" : "rejected (422)"}`, async ({ as }) => {
        const { admin, id } = await setup(as)
        if (from === "OVERSPENT") {
          await getPool().query(`UPDATE "BudgetNode" SET status='OVERSPENT' WHERE id=$1`, [id])
        } else {
          for (const s of PATH[from]) await data(await setStatus(admin, id, s))
        }
        const res = await setStatus(admin, id, to)
        if (ok) {
          expect((await data<any>(res)).status).toBe(to)
        } else {
          const err = await errorOf(res, 422)
          expect(err.error).toBe(`Cannot transition from ${from} to ${to}`)
          expect((await data<any>(await admin.get(`/api/nodes/${id}`))).status).toBe(from)
        }
      })
    }
  }
})

test.describe("PATCH /api/nodes/[id]/status", () => {
  test("records STATUS_CHANGED audit with note and invalidates node cache", async ({ as }) => {
    const { admin, id } = await setup(as)
    await data(await admin.get(`/api/nodes/${id}`)) // warm
    await data(await setStatus(admin, id, "IN_PROGRESS", "kickoff"))
    const n = await data<any>(await admin.get(`/api/nodes/${id}`))
    expect(n.status).toBe("IN_PROGRESS")
    const a = n.auditLogs.find((x: any) => x.action === "STATUS_CHANGED")
    expect(a.oldValue.status).toBe("PLANNED")
    expect(a.newValue).toMatchObject({ status: "IN_PROGRESS", note: "kickoff" })
  })

  test("project GET reflects status change (project cache invalidated)", async ({ as }) => {
    const { admin, id, projectId } = await setup(as)
    await data(await admin.get(`/api/projects/${projectId}`)) // warm (may already be cached)
    await data(await setStatus(admin, id, "IN_PROGRESS"))
    const p = await data<any>(await admin.get(`/api/projects/${projectId}`))
    expect(p.nodes.find((n: any) => n.id === id).status).toBe("IN_PROGRESS")
  })

  for (const role of ["admin", "manager", "verifier"] as const) {
    test(`${role} is allowed`, async ({ as }) => {
      const { id } = await setup(as)
      await data(await setStatus(await as(role), id, "IN_PROGRESS"))
    })
  }

  test("viewer gets 403", async ({ as }) => {
    const { id } = await setup(as)
    await errorOf(await setStatus(await as("viewer"), id, "IN_PROGRESS"), 403)
  })

  test("422 on invalid status enum", async ({ as }) => {
    const { admin, id } = await setup(as)
    await errorOf(await setStatus(admin, id, "DONE"), 422)
  })

  test("422 on missing status", async ({ as }) => {
    const { admin, id } = await setup(as)
    await errorOf(await admin.patch(`/api/nodes/${id}/status`, { data: {} }), 422)
  })

  test("404 unknown node", async ({ as }) => {
    await errorOf(await setStatus(await as("admin"), cuid(), "IN_PROGRESS"), 404)
  })
})
