import {
  test, expect, data, errorOf, createProject, createNode, userId, resetStorage, storedObjects, failNextStorageCall,
} from "../fixtures"
import { getPool, cuid } from "../helpers/db"

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const dataUrl = (b64 = PNG_B64) => `data:image/png;base64,${b64}`

const body = (nodeId: string, over: Record<string, unknown> = {}) => ({
  nodeId,
  signatureDataUrl: dataUrl(),
  signerName: "Jane Signer",
  signerEmail: "jane@example.com",
  role: "OWNER",
  ...over,
})

async function nodeStatus(id: string) {
  const { rows } = await getPool().query(`SELECT status FROM "BudgetNode" WHERE id=$1`, [id])
  return rows[0].status as string
}
async function actions(id: string) {
  const { rows } = await getPool().query(`SELECT action FROM "AuditLog" WHERE "nodeId"=$1`, [id])
  return rows.map((r) => r.action as string)
}
async function sigRows(id: string) {
  const { rows } = await getPool().query(`SELECT * FROM "Signature" WHERE "nodeId"=$1`, [id])
  return rows
}

test.describe("POST /api/signatures", () => {
  test.beforeEach(async () => { await resetStorage() })

  test("OWNER signature on PLANNED node -> 201, stored, PENDING_VERIFICATION, audits", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const sig = await data(await api.post("/api/signatures", { data: body(rootId) }), 201)
    expect(sig.role).toBe("OWNER")
    expect(sig.signerEmail).toBe("jane@example.com")
    const [row] = await sigRows(rootId)
    expect(row.signaturePath).toMatch(new RegExp(`^${rootId}/\\d+-jane@example\\.com\\.png$`))
    expect(row.signaturePath).not.toMatch(/^https?:/)
    const objs = await storedObjects()
    expect(objs.map((o) => o.key)).toContain(`signatures/${row.signaturePath}`)
    expect(objs[0].contentType).toContain("image/png")
    expect(await nodeStatus(rootId)).toBe("PENDING_VERIFICATION")
    const a = await actions(rootId)
    expect(a).toContain("SIGNATURE_ADDED")
    expect(a).toContain("STATUS_CHANGED")
  })

  test("APPROVER / WITNESS signature on PLANNED node does not transition status", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await data(await api.post("/api/signatures", { data: body(rootId, { role: "APPROVER" }) }), 201)
    await data(await api.post("/api/signatures", { data: body(rootId, { role: "WITNESS" }) }), 201)
    expect(await nodeStatus(rootId)).toBe("PLANNED")
    expect(await actions(rootId)).not.toContain("STATUS_CHANGED")
  })

  test("OWNER signature on IN_PROGRESS node leaves status unchanged", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await api.post(`/api/nodes/${rootId}/spend`, { data: { amount: "1.00" } })
    await data(await api.post("/api/signatures", { data: body(rootId) }), 201)
    expect(await nodeStatus(rootId)).toBe("IN_PROGRESS")
  })

  test("signature invalidates node cache (status + signatures visible)", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await data(await api.get(`/api/nodes/${rootId}`))
    await data(await api.post("/api/signatures", { data: body(rootId) }), 201)
    const n = await data(await api.get(`/api/nodes/${rootId}`))
    expect(n.status).toBe("PENDING_VERIFICATION")
    expect(n.signatures).toHaveLength(1)
  })

  test("signature works on child nodes", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const child = await createNode(api, rootId, "100.00", await userId("admin"))
    await data(await api.post("/api/signatures", { data: body(child.id) }), 201)
    expect(await nodeStatus(child.id)).toBe("PENDING_VERIFICATION")
  })

  const invalid: [string, Record<string, unknown>][] = [
    ["non-PNG data URL", { signatureDataUrl: "data:image/jpeg;base64,AAAA" }],
    ["plain string", { signatureDataUrl: "hello" }],
    ["short name", { signerName: "J" }],
    ["bad email", { signerEmail: "nope" }],
    ["bad role", { role: "BOSS" }],
    ["non-cuid nodeId", { nodeId: "not a cuid" }],
  ]
  for (const [label, over] of invalid) {
    test(`invalid ${label} -> 422, nothing stored`, async ({ as }) => {
      const api = await as("admin")
      const { rootId } = await createProject(api)
      await errorOf(await api.post("/api/signatures", { data: body(rootId, over) }), 422)
      expect(await storedObjects()).toHaveLength(0)
      expect(await sigRows(rootId)).toHaveLength(0)
    })
  }

  test("missing fields -> 422", async ({ as }) => {
    const api = await as("admin")
    await errorOf(await api.post("/api/signatures", { data: {} }), 422)
  })

  test("unknown node (valid cuid) -> 404; cross-org -> 404", async ({ as }) => {
    const api = await as("admin")
    const other = await as("otherAdmin")
    const { rootId } = await createProject(api)
    await errorOf(await api.post("/api/signatures", { data: body(cuid()) }), 404)
    await errorOf(await other.post("/api/signatures", { data: body(rootId) }), 404)
    expect(await storedObjects()).toHaveLength(0)
  })

  test("unauthenticated is rejected", async ({ as, anon }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await anon.post("/api/signatures", { data: body(rootId), maxRedirects: 0 })
    expect([301, 302, 307, 308, 401]).toContain(res.status())
    expect(await sigRows(rootId)).toHaveLength(0)
  })

  test("storage failure -> 500, no Signature row, status untouched", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await failNextStorageCall(1)
    await errorOf(await api.post("/api/signatures", { data: body(rootId) }), 500)
    expect(await sigRows(rootId)).toHaveLength(0)
    expect(await nodeStatus(rootId)).toBe("PLANNED")
  })

  test("empty base64 body must be a 4xx, not 500", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await api.post("/api/signatures", { data: body(rootId, { signatureDataUrl: "data:image/png;base64," }) })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test("oversized (>2MB) signature should be 4xx (413/422), not 500", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1).toString("base64")
    const res = await api.post("/api/signatures", { data: body(rootId, { signatureDataUrl: dataUrl(big) }) })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test("non-PNG bytes in a PNG data URL should be rejected", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const b64 = Buffer.from("<script>alert(1)</script>").toString("base64")
    const res = await api.post("/api/signatures", { data: body(rootId, { signatureDataUrl: dataUrl(b64) }) })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test("VIEWER must not be able to sign (403)", async ({ as }) => {
    const admin = await as("admin")
    const viewer = await as("viewer")
    const { rootId } = await createProject(admin)
    await errorOf(await viewer.post("/api/signatures", { data: body(rootId) }), 403)
  })
})
