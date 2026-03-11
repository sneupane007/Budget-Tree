import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { UpdateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession()
    const node = await prisma.budgetNode.findFirst({
      where: {
        id: params.id,
        project: { organizationId: session.user.organizationId },
      },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true } },
        children: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        receipts: { orderBy: { uploadedAt: "desc" } },
        signatures: { orderBy: { signedAt: "desc" } },
        auditLogs: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { timestamp: "desc" },
          take: 20,
        },
      },
    })
    if (!node) return error("Node not found", 404)
    return success(node)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}

export async function PATCH(
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
    const parsed = UpdateNodeSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id: params.id },
        data: parsed.data,
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
        },
      })
      await tx.auditLog.create({
        data: {
          nodeId: params.id,
          userId: session.user.id,
          action: "NODE_UPDATED",
          oldValue: { name: node.name, ownerId: node.ownerId },
          newValue: parsed.data,
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

export async function DELETE(
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
      include: { _count: { select: { children: true } } },
    })
    if (!node) return error("Node not found", 404)
    if (node._count.children > 0) return error("Cannot delete a node with children", 400)
    if (node.status !== "PLANNED") return error("Only PLANNED nodes can be deleted", 400)
    if (node.isRoot) return error("Cannot delete the root node", 400)

    await prisma.budgetNode.delete({ where: { id: params.id } })
    return success({ deleted: true })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
