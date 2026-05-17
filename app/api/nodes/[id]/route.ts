import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { UpdateNodeSchema } from "@/lib/validators/node"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { cacheKey, cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePattern } from "@/lib/cache"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    const orgId = session.user.organizationId
    const key = cacheKey(orgId, "nodes", id)

    const cached = await cacheGet(key)
    if (cached) return success(cached)

    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
        project: { organizationId: orgId },
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

    const data = {
      ...node,
      allocatedAmount: node.allocatedAmount.toString(),
      spentAmount: node.spentAmount.toString(),
      receipts: node.receipts.map((r) => ({ ...r, amount: r.amount.toString() })),
      children: node.children.map((c) => ({
        ...c,
        allocatedAmount: c.allocatedAmount.toString(),
        spentAmount: c.spentAmount.toString(),
      })),
    }
    await cacheSet(key, data, 30)
    return success(data)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER")
    const orgId = session.user.organizationId

    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
        project: { organizationId: orgId },
      },
    })
    if (!node) return error("Node not found", 404)

    const body = await req.json()
    const parsed = UpdateNodeSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const result = await tx.budgetNode.update({
        where: { id },
        data: parsed.data,
        include: {
          owner: { select: { id: true, name: true, email: true, role: true } },
        },
      })
      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "NODE_UPDATED",
          oldValue: { name: node.name, ownerId: node.ownerId },
          newValue: parsed.data,
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      return result
    })

    await cacheInvalidate(cacheKey(orgId, "nodes", id))
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    requireRole(session, "ADMIN", "MANAGER")
    const orgId = session.user.organizationId

    const node = await prisma.budgetNode.findFirst({
      where: {
        id,
        project: { organizationId: orgId },
      },
      include: { _count: { select: { children: true } } },
    })
    if (!node) return error("Node not found", 404)
    if (node._count.children > 0) return error("Cannot delete a node with children", 400)
    if (node.status !== "PLANNED") return error("Only PLANNED nodes can be deleted", 400)
    if (node.isRoot) return error("Cannot delete the root node", 400)

    await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      await tx.auditLog.create({
        data: {
          nodeId: id,
          userId: session.user.id,
          action: "NODE_DELETED",
          oldValue: { name: node.name, allocatedAmount: node.allocatedAmount.toString() },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      })
      await tx.budgetNode.delete({ where: { id } })
    })

    await cacheInvalidate(
      cacheKey(orgId, "nodes", id),
      cacheKey(orgId, "projects", node.projectId),
      cacheKey(orgId, "projects"),
    )
    await cacheInvalidatePattern(cacheKey(orgId, "audit", id, "*"))

    return success({ deleted: true })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
