import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { SpendUpdateSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { recalculateRollups } from "@/lib/budget/recalculate-rollups"
import Decimal from "decimal.js"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession()
    const node = await prisma.budgetNode.findFirst({
      where: {
        id: params.id,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = SpendUpdateSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const addedSpend = new Decimal(parsed.data.amount)
    const newSpent = new Decimal(node.spentAmount.toString()).add(addedSpend)
    const allocated = new Decimal(node.allocatedAmount.toString())
    const isOverspent = newSpent.gt(allocated)

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id: params.id },
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
          nodeId: params.id,
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
        await recalculateRollups(params.id, tx)
      }

      return result
    })

    return success(updated)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
