import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { UploadReceiptSchema } from "@/lib/validators/receipt"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { uploadReceipt } from "@/lib/storage"
import Decimal from "decimal.js"
import { cacheKey, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

// The declared MIME type is client-supplied; confirm the bytes match it.
function matchesType(buf: Buffer, type: string): boolean {
  switch (type) {
    case "image/jpeg": return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case "image/png": return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case "image/webp": return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP"
    case "application/pdf": return buf.subarray(0, 5).toString("latin1") === "%PDF-"
    default: return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER", "VERIFIER")
    const formData = await req.formData()

    const file = formData.get("file") as File | null
    if (!file) return error("No file provided", 400)
    if (!ALLOWED_TYPES.includes(file.type)) return error("Invalid file type", 400)
    if (file.size > MAX_SIZE) return error("File too large (max 10MB)", 400)

    const nodeId = formData.get("nodeId") as string
    if (!nodeId) return error("nodeId is required", 400)

    const meta = {
      // formData.get() returns null for omitted fields, which zod's .optional() rejects
      amount: formData.get("amount"),
      vendor: formData.get("vendor") ?? undefined,
      receiptDate: formData.get("receiptDate") ?? undefined,
      notes: formData.get("notes") ?? undefined,
    }
    const parsed = UploadReceiptSchema.safeParse(meta)
    if (!parsed.success) return validationError(parsed.error.issues)

    // Verify node belongs to same org
    const node = await prisma.budgetNode.findFirst({
      where: {
        id: nodeId,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!matchesType(buffer, file.type)) return error("File content does not match its declared type", 400)
    const filePath = await uploadReceipt(nodeId, buffer, file.name, file.type)

    const receipt = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const r = await tx.receipt.create({
        data: {
          nodeId,
          filePath,
          fileType: file.type,
          amount: new Decimal(parsed.data.amount).toFixed(2),
          vendor: parsed.data.vendor,
          receiptDate: parsed.data.receiptDate ? new Date(parsed.data.receiptDate) : undefined,
          notes: parsed.data.notes,
          uploadedBy: session.user.id,
        },
      })
      await tx.auditLog.create({
        data: {
          nodeId,
          userId: session.user.id,
          action: "RECEIPT_UPLOADED",
          newValue: { receiptId: r.id, amount: parsed.data.amount, vendor: parsed.data.vendor },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      return r
    })

    const orgId = session.user.organizationId
    await cacheInvalidate(cacheKey(orgId, "nodes", nodeId))
    await cacheInvalidatePattern(cacheKey(orgId, "audit", nodeId, "*"))

    return success(receipt, 201)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
