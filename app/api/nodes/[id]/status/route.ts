import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { UpdateNodeStatusSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER", "VERIFIER")

    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = UpdateNodeStatusSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const VALID_TRANSITIONS: Record<string, string[]> = {
      PLANNED: ["IN_PROGRESS", "FLAGGED"],
      IN_PROGRESS: ["PENDING_VERIFICATION", "FLAGGED", "PLANNED"],
      PENDING_VERIFICATION: ["VERIFIED", "IN_PROGRESS", "FLAGGED"],
      VERIFIED: ["IN_PROGRESS"],
      FLAGGED: ["IN_PROGRESS", "PLANNED"],
      OVERSPENT: ["FLAGGED"],
    }
    const allowed = VALID_TRANSITIONS[node.status] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return error(`Cannot transition from ${node.status} to ${parsed.data.status}`, 422)
    }

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id },
        data: { status: parsed.data.status },
      })
      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "STATUS_CHANGED",
          oldValue: { status: node.status },
          newValue: { status: parsed.data.status, note: parsed.data.note },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      return result
    })

    return success({
      ...updated,
      allocatedAmount: updated.allocatedAmount.toString(),
      spentAmount: updated.spentAmount.toString(),
    })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
