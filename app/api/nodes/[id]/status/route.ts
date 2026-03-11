import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { UpdateNodeStatusSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER", "VERIFIER")

    const node = await prisma.budgetNode.findFirst({
      where: {
        id: params.id,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = UpdateNodeStatusSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id: params.id },
        data: { status: parsed.data.status },
      })
      await tx.auditLog.create({
        data: {
          nodeId: params.id,
          userId: session.user.id,
          action: "STATUS_CHANGED",
          oldValue: { status: node.status },
          newValue: { status: parsed.data.status, note: parsed.data.note },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      return result
    })

    return success(updated)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
