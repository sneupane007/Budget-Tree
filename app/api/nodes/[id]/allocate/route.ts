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

    const body = await req.json().catch(() => { throw new AuthError("Invalid JSON body", 400) })
    const parsed = AllocateNodeSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const newAmount = new Decimal(parsed.data.allocatedAmount)

    const outcome = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      // Lock this node and its parent (ordered by id) so concurrent allocations and
      // child creates serialize, then validate against committed sibling data.
      await tx.$queryRaw`
        SELECT id FROM "BudgetNode"
        WHERE id = ${id} OR id = ${node.parentId}
        ORDER BY id
        FOR UPDATE
      `

      // Validate against parent (excluding self from sibling sum)
      if (node.parentId) {
        const validation = await validateAllocation(node.parentId, newAmount, node.id, session.user.organizationId, tx)
        if (!validation.valid) return { invalid: validation.message! }
      }

      // Ensure new amount >= already allocated to children
      const children = await tx.budgetNode.findMany({
        where: { parentId: id },
        select: { allocatedAmount: true },
      })
      const childrenSum = children.reduce(
        (sum: Decimal, c: { allocatedAmount: { toString(): string } }) =>
          sum.add(new Decimal(c.allocatedAmount.toString())),
        new Decimal(0)
      )
      if (newAmount.lt(childrenSum)) {
        return {
          invalid: `New allocation ${newAmount.toFixed(2)} is less than children's total ${childrenSum.toFixed(2)}`,
        }
      }

      const result = await tx.budgetNode.update({
        where: { id },
        data: { allocatedAmount: newAmount.toFixed(2) },
      })
      // The root's allocation is the project's total budget; keep them in sync.
      if (node.isRoot) {
        await tx.project.update({ where: { id: node.projectId }, data: { totalBudget: newAmount.toFixed(2) } })
      }
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
      return { updated: result }
    })
    if ("invalid" in outcome) return error(outcome.invalid!, 422)
    const updated = outcome.updated

    const orgId = session.user.organizationId
    await cacheInvalidate(
      cacheKey(orgId, "nodes", id),
      cacheKey(orgId, "projects", node.projectId),
      cacheKey(orgId, "projects"),
      cacheKey(orgId, "dashboard"),
      ...(node.parentId ? [cacheKey(orgId, "nodes", node.parentId)] : []),
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
