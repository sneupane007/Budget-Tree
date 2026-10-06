import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { SubmitSignatureSchema } from "@/lib/validators/signature"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { uploadSignature } from "@/lib/storage"
import { cacheKey, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER", "VERIFIER")
    const body = await req.json().catch(() => { throw new AuthError("Invalid JSON body", 400) })
    const parsed = SubmitSignatureSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const { nodeId, signatureDataUrl, signerName, signerEmail, role } = parsed.data

    const node = await prisma.budgetNode.findFirst({
      where: {
        id: nodeId,
        project: { organizationId: session.user.organizationId },
      },
      include: {
        signatures: { select: { role: true } },
      },
    })
    if (!node) return error("Node not found", 404)

    const png = Buffer.from(signatureDataUrl.slice("data:image/png;base64,".length), "base64")
    if (!png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return error("Signature is not a valid PNG image", 422)
    }
    if (png.length > 2 * 1024 * 1024) return error("Signature image too large (max 2MB)", 413)

    const ip = req.headers.get("x-forwarded-for") ?? undefined
    const signaturePath = await uploadSignature(nodeId, signatureDataUrl, signerEmail)

    const signature = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const sig = await tx.signature.create({
        data: {
          nodeId,
          signaturePath,
          signerName,
          signerEmail,
          role,
          ipAddress: ip,
        },
      })

      await tx.auditLog.create({
        data: {
          nodeId,
          userId: session.user.id,
          action: "SIGNATURE_ADDED",
          newValue: { signerName, signerEmail, role },
          ipAddress: ip,
        },
      })

      // Auto-transition: if node has OWNER signature and is PLANNED → PENDING_VERIFICATION
      const hasOwnerSig =
        role === "OWNER" ||
        node.signatures.some((s: { role: string }) => s.role === "OWNER")
      if (hasOwnerSig && node.status === "PLANNED") {
        await tx.budgetNode.update({
          where: { id: nodeId },
          data: { status: "PENDING_VERIFICATION" },
        })
        await tx.auditLog.create({
          data: {
            nodeId,
            userId: session.user.id,
            action: "STATUS_CHANGED",
            oldValue: { status: node.status },
            newValue: { status: "PENDING_VERIFICATION", reason: "Owner signature received" },
            ipAddress: ip,
          },
        })
      }

      return sig
    })

    const orgId = session.user.organizationId
    const invalidateKeys = [cacheKey(orgId, "nodes", nodeId), cacheKey(orgId, "projects", node.projectId)]
    if (node.status === "PLANNED") invalidateKeys.push(cacheKey(orgId, "dashboard"))
    await cacheInvalidate(...invalidateKeys)
    await cacheInvalidatePattern(cacheKey(orgId, "audit", nodeId, "*"))

    return success(signature, 201)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
