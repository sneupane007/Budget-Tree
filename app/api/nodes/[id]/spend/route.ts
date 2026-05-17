import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { SpendUpdateSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { recalculateRollups } from "@/lib/budget/recalculate-rollups"
import Decimal from "decimal.js"
import { cacheKey, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = SpendUpdateSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const addedSpend = new Decimal(parsed.data.amount)
    if (addedSpend.lte(0)) return error("Spend amount must be positive", 422)
    const newSpent = new Decimal(node.spentAmount.toString()).add(addedSpend)
    const allocated = new Decimal(node.allocatedAmount.toString())
    const isOverspent = newSpent.gt(allocated)

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id },
        data: {
          spentAmount: newSpent.toFixed(2),
          status: isOverspent
            ? "OVERSPENT"
            : newSpent.gt(0)
              ? "IN_PROGRESS"
              : node.status,
        },
      })

      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "SPEND_RECORDED",
          oldValue: { spentAmount: node.spentAmount.toString() },
          newValue: {
            spentAmount: newSpent.toFixed(2),
            addedAmount: parsed.data.amount,
            note: parsed.data.note,
          },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })

      if (node.parentId) {
        await recalculateRollups(id, tx)
      }

      return result
    })

    const orgId = session.user.organizationId
    await cacheInvalidate(
      cacheKey(orgId, "nodes", id),
      cacheKey(orgId, "dashboard"),
      cacheKey(orgId, "projects", node.projectId),
    )
    await cacheInvalidatePattern(cacheKey(orgId, "audit", id, "*"))

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
