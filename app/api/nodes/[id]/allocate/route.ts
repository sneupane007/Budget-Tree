import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { AllocateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { validateAllocation } from "@/lib/budget/validate-allocation"
import Decimal from "decimal.js"
import { cacheKey, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER")

    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
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
      const validation = await validateAllocation(node.parentId, newAmount, node.id, session.user.organizationId)
      if (!validation.valid) return error(validation.message!, 422)
    }

    // Ensure new amount >= already allocated to children
    const children = await prisma.budgetNode.findMany({
      where: { parentId: id },
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
        where: { id },
        data: { allocatedAmount: newAmount.toFixed(2) },
      })
      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "BUDGET_AMENDED",
          oldValue: { allocatedAmount: node.allocatedAmount.toString() },
          newValue: { allocatedAmount: parsed.data.allocatedAmount, reason: parsed.data.reason },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      return result
    })

    const orgId = session.user.organizationId
    await cacheInvalidate(cacheKey(orgId, "nodes", id))
    await cacheInvalidatePattern(cacheKey(orgId, "audit", id, "*"))
    if (node.projectId) await cacheInvalidate(cacheKey(orgId, "projects", node.projectId))

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
