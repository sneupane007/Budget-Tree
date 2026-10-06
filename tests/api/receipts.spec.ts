import {
  test, expect, data, errorOf, createProject, createNode, userId, resetStorage, storedObjects, failNextStorageCall,
} from "../fixtures"
import { getPool } from "../helpers/db"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(64, 0x20), Buffer.from("\n%%EOF")])
const MB10 = 10 * 1024 * 1024

type Part = { name: string; mimeType: string; buffer: Buffer }
const png = (name = "r.png"): Part => ({ name, mimeType: "image/png", buffer: PNG })

function upload(api: any, nodeId: string, file: Part | undefined, extra: Record<string, string> = {}) {
  // NOTE: receiptDate/notes are sent because the route's zod schema rejects the null that formData.get()
  // returns for omitted optional fields (see BUG test "optional fields omitted").
  const multipart: Record<string, any> = { nodeId, amount: "12.50", vendor: "ACME", receiptDate: "2024-03-05", notes: "n", ...extra }
  if (file) multipart.file = file
  return api.post("/api/receipts", { multipart })
}

async function receiptRows(nodeId: string) {
  const { rows } = await getPool().query(
    `SELECT id,"filePath","fileType",amount::text AS amount,vendor FROM "Receipt" WHERE "nodeId"=$1`, [nodeId])
  return rows as { id: string; filePath: string; fileType: string; amount: string; vendor: string | null }[]
}
async function audit(nodeId: string, action: string) {
  const { rows } = await getPool().query(`SELECT 1 FROM "AuditLog" WHERE "nodeId"=$1 AND action=$2`, [nodeId, action])
  return rows.length
}

test.describe("receipts API", () => {
  test.beforeEach(async () => { await resetStorage() })

  test("upload PNG -> 201, row stores path only, object in receipts bucket, audit written", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const r = await data(await upload(api, rootId, png(), { receiptDate: "2024-03-05", notes: "n" }), 201)
    expect(r.nodeId).toBe(rootId)
    expect(r.fileType).toBe("image/png")
    expect(r.amount).toBe("12.5")
    const [row] = await receiptRows(rootId)
    expect(row.filePath).toMatch(new RegExp(`^${rootId}/\\d+-r\\.png$`))
    expect(row.filePath).not.toMatch(/^https?:/)
    expect(row.filePath).not.toContain("token=")
    const objs = await storedObjects()
    expect(objs.map((o) => o.key)).toContain(`receipts/${row.filePath}`)
    expect(objs[0].contentType).toContain("image/png")
    expect(await audit(rootId, "RECEIPT_UPLOADED")).toBe(1)
  })

  for (const [name, mimeType, buffer] of [
    ["a.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ["a.webp", "image/webp", Buffer.from("RIFF\0\0\0\0WEBP")],
    ["a.pdf", "application/pdf", PDF],
  ] as const) {
    test(`accepts ${mimeType}`, async ({ as }) => {
      const api = await as("admin")
      const { rootId } = await createProject(api)
      const r = await data(await upload(api, rootId, { name, mimeType, buffer }), 201)
      expect(r.fileType).toBe(mimeType)
    })
  }

  test("GET /api/receipts/:id returns a signedUrl that serves the stored bytes", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const r = await data(await upload(api, rootId, png()), 201)
    const got = await data(await api.get(`/api/receipts/${r.id}`))
    expect(got.id).toBe(r.id)
    expect(got.amount).toBe("12.5")
    expect(got.signedUrl).toBeTruthy()
    const url = got.signedUrl.startsWith("http") ? got.signedUrl : undefined
    expect(url).toBeTruthy()
    const file = await fetch(url!)
    expect(file.status).toBe(200)
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true)
  })

  test("GET receipt: unknown -> 404, cross-org -> 404, unauthenticated not served", async ({ as, anon }) => {
    const api = await as("admin")
    const other = await as("otherAdmin")
    const { rootId } = await createProject(api)
    const r = await data(await upload(api, rootId, png()), 201)
    await errorOf(await api.get(`/api/receipts/cnonexistent000000000000`), 404)
    await errorOf(await other.get(`/api/receipts/${r.id}`), 404)
    const res = await anon.get(`/api/receipts/${r.id}`, { maxRedirects: 0 })
    expect([301, 302, 307, 308, 401]).toContain(res.status())
  })

  test("missing file -> 400", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await errorOf(await upload(api, rootId, undefined), 400)
  })

  test("missing nodeId -> 400", async ({ as }) => {
    const api = await as("admin")
    const res = await api.post("/api/receipts", { multipart: { file: png(), amount: "1.00", vendor: "v", receiptDate: "2024-01-01", notes: "n" } })
    await errorOf(res, 400)
  })

  for (const [name, mimeType] of [["a.gif", "image/gif"], ["a.txt", "text/plain"], ["a.svg", "image/svg+xml"], ["a.exe", "application/octet-stream"]]) {
    test(`disallowed type ${mimeType} -> 400, nothing stored`, async ({ as }) => {
      const api = await as("admin")
      const { rootId } = await createProject(api)
      await errorOf(await upload(api, rootId, { name, mimeType, buffer: Buffer.from("hello") }), 400)
      expect(await storedObjects()).toHaveLength(0)
      expect(await receiptRows(rootId)).toHaveLength(0)
    })
  }

  for (const amount of ["0", "-1", "abc", ""]) {
    test(`bad amount ${JSON.stringify(amount)} -> 422`, async ({ as }) => {
      const api = await as("admin")
      const { rootId } = await createProject(api)
      await errorOf(await upload(api, rootId, png(), { amount }), 422)
      expect(await storedObjects()).toHaveLength(0)
    })
  }

  test("missing amount -> 422", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await api.post("/api/receipts", { multipart: { file: png(), nodeId: rootId, vendor: "v", receiptDate: "2024-01-01", notes: "n" } })
    await errorOf(res, 422)
  })

  test("unknown node -> 404 and cross-org node -> 404, nothing stored", async ({ as }) => {
    const api = await as("admin")
    const other = await as("otherAdmin")
    const { rootId } = await createProject(api)
    await errorOf(await upload(api, "cnonexistent000000000000", png()), 404)
    await errorOf(await upload(other, rootId, png()), 404)
    expect(await storedObjects()).toHaveLength(0)
    expect(await receiptRows(rootId)).toHaveLength(0)
  })

  test("9MB file accepted", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const buffer = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(9 * 1024 * 1024 - 5)])
    await data(await upload(api, rootId, { name: "big.pdf", mimeType: "application/pdf", buffer }), 201)
    expect((await storedObjects())[0].size).toBe(9 * 1024 * 1024)
  })

  test("exactly 10MB file should be accepted", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const buffer = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MB10 - 5)])
    await data(await upload(api, rootId, { name: "big.pdf", mimeType: "application/pdf", buffer }), 201)
    expect((await storedObjects())[0].size).toBe(MB10)
  })

  test("10MB + 1 byte file should be 400, nothing stored", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const buffer = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MB10 - 4)])
    const res = await upload(api, rootId, { name: "big.pdf", mimeType: "application/pdf", buffer })
    await errorOf(res, 400)
    expect(await storedObjects()).toHaveLength(0)
  })

  test("storage failure -> 500 and no Receipt row / audit", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await failNextStorageCall(1)
    await errorOf(await upload(api, rootId, png()), 500)
    expect(await receiptRows(rootId)).toHaveLength(0)
    expect(await audit(rootId, "RECEIPT_UPLOADED")).toBe(0)
    // recovers afterwards
    await data(await upload(api, rootId, png()), 201)
  })

  test("upload invalidates node cache (receipt shows in GET /api/nodes/:id)", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    expect((await data(await api.get(`/api/nodes/${rootId}`))).receipts).toHaveLength(0)
    await data(await upload(api, rootId, png()), 201)
    expect((await data(await api.get(`/api/nodes/${rootId}`))).receipts).toHaveLength(1)
  })

  test("receipt upload does not change node spentAmount", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await data(await upload(api, rootId, png()), 201)
    const n = await data(await api.get(`/api/nodes/${rootId}`))
    expect(Number(n.spentAmount)).toBe(0)
  })

  test("filename with spaces and unicode uploads and is retrievable", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const r = await data(await upload(api, rootId, png("my receipt é 日本.png")), 201)
    const got = await data(await api.get(`/api/receipts/${r.id}`))
    const file = await fetch(got.signedUrl)
    expect(file.status).toBe(200)
  })

  test("path-traversal filename stays under the node prefix", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await upload(api, rootId, png("../../other/evil.png"))
    expect([201, 400, 422]).toContain(res.status())
    if (res.status() === 201) {
      const [row] = await receiptRows(rootId)
      expect(row.filePath.startsWith(`${rootId}/`)).toBe(true)
    }
  })

  test("upload with only file+nodeId+amount (what the UI sends) must succeed", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await api.post("/api/receipts", { multipart: { file: png(), nodeId: rootId, amount: "5.00" } })
    expect(res.status()).toBe(201)
  })

  test("filename containing '../' should be sanitized out of the storage path", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    await upload(api, rootId, png("../../other/evil.png"))
    const rows = await receiptRows(rootId)
    expect(rows).toHaveLength(1)
    expect(rows[0].filePath).not.toContain("..")
    expect(rows[0].filePath.split("/")).toHaveLength(2)
  })

  test("MIME spoofing - non-image bytes declared as image/png must be rejected", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const res = await upload(api, rootId, { name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") })
    expect(res.status()).toBe(400)
  })

  test("VIEWER must not be able to upload receipts (403)", async ({ as }) => {
    const admin = await as("admin")
    const viewer = await as("viewer")
    const { rootId } = await createProject(admin)
    await errorOf(await upload(viewer, rootId, png()), 403)
  })

  test("node created by manager is uploadable by admin (org scope, child nodes)", async ({ as }) => {
    const api = await as("admin")
    const { rootId } = await createProject(api)
    const child = await createNode(api, rootId, "100.00", await userId("admin"))
    await data(await upload(api, child.id, png()), 201)
    expect(await receiptRows(child.id)).toHaveLength(1)
  })
})
