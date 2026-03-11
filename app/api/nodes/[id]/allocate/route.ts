import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { AllocateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { validateAllocation } from "@/lib/budget/validate-allocation"
import Decimal from "decimal.js"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER")

    const node = await prisma.budgetNode.findFirst({
      where: {
        id: params.id,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = AllocateNodeSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const newAmount = new Decimal(parsed.data.allocatedAmount)

    // Validate against parent (excluding self from sibling sum)
    if (node.parentId) {
      const validation = await validateAllocation(node.parentId, newAmount, node.id)
      if (!validation.valid) return error(validation.message!, 422)
    }

    // Ensure new amount >= already allocated to children
    const children = await prisma.budgetNode.findMany({
      where: { parentId: node.id },
      select: { allocatedAmount: true },
    })
    const childrenSum = children.reduce(
      (sum: Decimal, c: { allocatedAmount: { toString(): string } }) =>
        sum.add(new Decimal(c.allocatedAmount.toString())),
      new Decimal(0)
    )
    if (newAmount.lt(childrenSum)) {
      return error(
        `New allocation ${newAmount.toFixed(2)} is less than children's total ${childrenSum.toFixed(2)}`,
        422
      )
    }

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id: params.id },
        data: { allocatedAmount: newAmount.toFixed(2) },
      })
      await tx.auditLog.create({
        data: {
          nodeId: params.id,
          userId: session.user.id,
          action: "BUDGET_AMENDED",
          oldValue: { allocatedAmount: node.allocatedAmount.toString() },
          newValue: { allocatedAmount: parsed.data.allocatedAmount, reason: parsed.data.reason },
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
