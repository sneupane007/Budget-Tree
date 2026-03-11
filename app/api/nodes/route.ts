import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { CreateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { validateAllocation } from "@/lib/budget/validate-allocation"
import Decimal from "decimal.js"

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
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

    // Validate allocation
    const requestedDecimal = new Decimal(allocatedAmount)
    const validation = await validateAllocation(parentId, requestedDecimal)
    if (!validation.valid) return error(validation.message!, 422)

    const node = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
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

      return created
    })

    return success(node, 201)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
