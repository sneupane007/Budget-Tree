import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { SpendUpdateSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { lockNodeChain, rollUpSpend } from "@/lib/budget/recalculate-rollups"
import Decimal from "decimal.js"
import { cacheKey, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

export async function POST(
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

    const body = await req.json().catch(() => { throw new AuthError("Invalid JSON body", 400) })
    const parsed = SpendUpdateSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const addedSpend = new Decimal(parsed.data.amount).toDecimalPlaces(2)
    if (addedSpend.lte(0)) return error("Spend amount must be positive", 422)

    // Lock the node + ancestors, then re-read inside the transaction so concurrent
    // spends serialize (no lost updates) and status decisions use fresh values.
    const { updated, ancestorIds } = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      await lockNodeChain(id, tx)
      const fresh = await tx.budgetNode.findUniqueOrThrow({ where: { id } })
      const newSpent = new Decimal(fresh.spentAmount.toString()).add(addedSpend)
      const allocated = new Decimal(fresh.allocatedAmount.toString())

      // Only PLANNED -> IN_PROGRESS is a spend-driven transition; any other status
      // (VERIFIED, PENDING_VERIFICATION, FLAGGED, ...) is left to the status route.
      const status = newSpent.gt(allocated)
        ? "OVERSPENT"
        : fresh.status === "PLANNED"
          ? "IN_PROGRESS"
          : fresh.status

      const result = await tx.budgetNode.update({
        where: { id },
        data: { spentAmount: newSpent.toFixed(2), status },
      })

      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "SPEND_RECORDED",
          oldValue: { spentAmount: fresh.spentAmount.toString() },
          newValue: {
            spentAmount: newSpent.toFixed(2),
            addedAmount: parsed.data.amount,
            note: parsed.data.note,
          },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })

      const ancestorIds = node.parentId ? await rollUpSpend(id, addedSpend.toFixed(2), tx) : []
      return { updated: result, ancestorIds }
    })

    const orgId = session.user.organizationId
    await cacheInvalidate(
      cacheKey(orgId, "nodes", id),
      cacheKey(orgId, "dashboard"),
      cacheKey(orgId, "projects", node.projectId),
      cacheKey(orgId, "projects"),
      ...ancestorIds.map((aid) => cacheKey(orgId, "nodes", aid)),
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
