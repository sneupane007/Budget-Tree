// In-process fakes for the two external services the app talks to server-side:
//   - Upstash Redis REST   (lib/cache.ts)            on UPSTASH_PORT
//   - Supabase Storage     (lib/storage.ts)          on SUPABASE_PORT
// Started as a Playwright webServer (`tsx tests/helpers/fake-services.ts`).
// Control endpoints (tests call these directly):
//   POST /__flush                       (upstash)  clear all keys
//   GET  /__keys                        (upstash)  list live keys
//   GET  /__objects                     (supabase) list stored objects
//   POST /__reset                       (supabase) clear objects + failure injection
//   POST /__fail-next  {count?:number}  (supabase) next N storage calls return 500
import http from "node:http"
import { SUPABASE_PORT, UPSTASH_PORT } from "./env"

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

// ───────────────────────── Upstash ─────────────────────────
const store = new Map<string, { value: string; expiresAt: number | null }>()

function live(key: string) {
  const e = store.get(key)
  if (!e) return undefined
  if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return e
}

function globToRegExp(glob: string) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
  return new RegExp(`^${esc}$`)
}

function runCommand(cmd: unknown[]): unknown {
  const [name, ...args] = cmd.map((c) => (typeof c === "string" ? c : String(c)))
  switch (name.toUpperCase()) {
    case "GET":
      return live(args[0])?.value ?? null
    case "SET": {
      const [key, value, ...opts] = args
      let expiresAt: number | null = null
      let nx = false
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i].toUpperCase()
        if (o === "EX") expiresAt = Date.now() + Number(opts[++i]) * 1000
        else if (o === "PX") expiresAt = Date.now() + Number(opts[++i])
        else if (o === "NX") nx = true
      }
      if (nx && live(key)) return null
      store.set(key, { value, expiresAt })
      return "OK"
    }
    case "DEL": {
      let n = 0
      for (const k of args) if (live(k) && store.delete(k)) n++
      return n
    }
    case "EXISTS":
      return args.filter((k) => live(k)).length
    case "SCAN": {
      // Single-page scan: return every match and cursor "0".
      const re = (() => {
        const i = args.findIndex((a) => a.toUpperCase() === "MATCH")
        return globToRegExp(i >= 0 ? args[i + 1] : "*")
      })()
      const keys = [...store.keys()].filter((k) => live(k) && re.test(k))
      return ["0", keys]
    }
    case "FLUSHALL":
    case "FLUSHDB":
      store.clear()
      return "OK"
    default:
      throw new Error(`fake-upstash: unsupported command ${name}`)
  }
}

// @upstash/redis sends `Upstash-Encoding: base64` and base64-decodes every
// string result except "OK", so the fake must encode the same way.
function encode(v: unknown, b64: boolean): unknown {
  if (!b64) return v
  if (typeof v === "string") return v === "OK" ? v : Buffer.from(v).toString("base64")
  if (Array.isArray(v)) return v.map((x) => encode(x, b64))
  return v
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname === "/__health") return json(res, 200, { ok: true })
    if (url.pathname === "/__flush") {
      store.clear()
      return json(res, 200, { ok: true })
    }
    if (url.pathname === "/__keys") {
      return json(res, 200, { keys: [...store.keys()].filter((k) => live(k)) })
    }
    const b64 = req.headers["upstash-encoding"] === "base64"
    const raw = (await readBody(req)).toString("utf8")
    try {
      const body = raw ? JSON.parse(raw) : []
      if (url.pathname === "/pipeline" || url.pathname === "/multi-exec") {
        const out = (body as unknown[][]).map((c) => {
          try {
            return { result: encode(runCommand(c), b64) }
          } catch (e) {
            return { error: (e as Error).message }
          }
        })
        return json(res, 200, out)
      }
      return json(res, 200, { result: encode(runCommand(body), b64) })
    } catch (e) {
      return json(res, 400, { error: (e as Error).message })
    }
  })
  .listen(UPSTASH_PORT, "127.0.0.1", () => console.log(`fake-upstash on :${UPSTASH_PORT}`))

// ───────────────────────── Supabase Storage ─────────────────────────
const objects = new Map<string, { size: number; contentType: string; body: Buffer }>()
let failNext = 0
const BUCKET_LIMITS: Record<string, number> = {
  receipts: 10 * 1024 * 1024,
  signatures: 2 * 1024 * 1024,
  exports: Number.MAX_SAFE_INTEGER,
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x")
    const p = decodeURIComponent(url.pathname)

    if (p === "/__health") return json(res, 200, { ok: true })
    if (p === "/__reset") {
      objects.clear()
      failNext = 0
      return json(res, 200, { ok: true })
    }
    if (p === "/__objects") {
      return json(res, 200, {
        objects: [...objects.entries()].map(([key, o]) => ({ key, size: o.size, contentType: o.contentType })),
      })
    }
    if (p === "/__fail-next") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}")
      failNext = Number(body.count ?? 1)
      return json(res, 200, { ok: true })
    }

    const body = await readBody(req)

    if (failNext > 0) {
      failNext--
      return json(res, 500, { statusCode: "500", error: "Internal", message: "injected failure" })
    }

    // POST /storage/v1/object/sign/:bucket/*path  → create signed URL
    const sign = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/)
    if (sign && req.method === "POST") {
      const key = `${sign[1]}/${sign[2]}`
      if (!objects.has(key)) return json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" })
      return json(res, 200, { signedURL: `/object/sign/${key}?token=fake-token` })
    }
    // GET /storage/v1/object/sign/:bucket/*path?token → download
    if (sign && req.method === "GET") {
      const o = objects.get(`${sign[1]}/${sign[2]}`)
      if (!o) return json(res, 404, { message: "Object not found" })
      res.writeHead(200, { "content-type": o.contentType })
      return res.end(o.body)
    }

    // POST /storage/v1/object/:bucket/*path → upload
    const up = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)
    if (up && (req.method === "POST" || req.method === "PUT")) {
      const [, bucket, objPath] = up
      const key = `${bucket}/${objPath}`
      if (body.length > (BUCKET_LIMITS[bucket] ?? Number.MAX_SAFE_INTEGER)) {
        return json(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" })
      }
      if (req.method === "POST" && objects.has(key) && req.headers["x-upsert"] !== "true") {
        return json(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" })
      }
      objects.set(key, { size: body.length, contentType: String(req.headers["content-type"] ?? ""), body })
      return json(res, 200, { Id: key, Key: key })
    }

    // DELETE /storage/v1/object/:bucket  { prefixes: [...] }
    const del = p.match(/^\/storage\/v1\/object\/([^/]+)$/)
    if (del && req.method === "DELETE") {
      const { prefixes = [] } = JSON.parse(body.toString("utf8") || "{}")
      for (const pre of prefixes) objects.delete(`${del[1]}/${pre}`)
      return json(res, 200, [])
    }

    json(res, 404, { message: `fake-supabase: no handler for ${req.method} ${p}` })
  })
  .listen(SUPABASE_PORT, "127.0.0.1", () => console.log(`fake-supabase on :${SUPABASE_PORT}`))
