import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { CreateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { validateAllocation } from "@/lib/budget/validate-allocation"
import Decimal from "decimal.js"
import { cacheKey, cacheInvalidate } from "@/lib/cache"

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER")
    const body = await req.json().catch(() => { throw new AuthError("Invalid JSON body", 400) })
    const parsed = CreateNodeSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const { name, description, allocatedAmount, currency, parentId, ownerId } = parsed.data

    // Verify parent belongs to the same org
    const parent = await prisma.budgetNode.findFirst({
      where: {
        id: parentId,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!parent) return error("Parent node not found", 404)

    // Verify owner belongs to same org
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: session.user.organizationId },
    })
    if (!owner) return error("Owner not found in your organization", 404)

    const requestedDecimal = new Decimal(allocatedAmount)

    const outcome = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      // Lock the parent so concurrent creates under it serialize: each one validates
      // against the siblings committed by the previous one.
      await tx.$queryRaw`SELECT id FROM "BudgetNode" WHERE id = ${parentId} FOR UPDATE`
      const validation = await validateAllocation(parentId, requestedDecimal, undefined, session.user.organizationId, tx)
      if (!validation.valid) return { invalid: validation.message! }

      const created = await tx.budgetNode.create({
        data: {
          name,
          description,
          allocatedAmount: requestedDecimal.toFixed(2),
          currency,
          parentId,
          projectId: parent.projectId,
          depth: parent.depth + 1,
          status: "PLANNED",
          ownerId,
        },
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          nodeId: created.id,
          userId: session.user.id,
          action: "NODE_CREATED",
          newValue: { name, allocatedAmount, parentId },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })

      return { node: created }
    })
    if ("invalid" in outcome) return error(outcome.invalid!, 422)
    const node = outcome.node

    const orgId = session.user.organizationId
    await cacheInvalidate(
      cacheKey(orgId, "nodes", parentId),
      cacheKey(orgId, "projects", parent.projectId),
      cacheKey(orgId, "projects"),
      cacheKey(orgId, "dashboard"),
    )

    return success({
      ...node,
      allocatedAmount: node.allocatedAmount.toString(),
      spentAmount: node.spentAmount.toString(),
    }, 201)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
