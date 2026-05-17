import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { CreateProjectSchema } from "@/lib/validators/project"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import Decimal from "decimal.js"
import { cacheKey, cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache"

export async function GET() {
  try {
    const session = await requireSession()
    const orgId = session.user.organizationId
    const key = cacheKey(orgId, "projects")

    const cached = await cacheGet(key)
    if (cached) return success(cached)

    const projects = await prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        rootNode: {
          select: {
            id: true,
            name: true,
            allocatedAmount: true,
            spentAmount: true,
            status: true,
          },
        },
        _count: { select: { nodes: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    await cacheSet(key, projects, 60)
    return success(projects)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const parsed = CreateProjectSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const { name, description, totalBudget, currency } = parsed.data

    const project = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const proj = await tx.project.create({
        data: {
          name,
          description,
          totalBudget: new Decimal(totalBudget).toFixed(2),
          currency,
          organizationId: session.user.organizationId,
        },
      })

      const rootNode = await tx.budgetNode.create({
        data: {
          name,
          description,
          allocatedAmount: new Decimal(totalBudget).toFixed(2),
          currency,
          isRoot: true,
          depth: 0,
          status: "PLANNED",
          projectId: proj.id,
          ownerId: session.user.id,
          rootForProject: { connect: { id: proj.id } },
        },
      })

      await tx.auditLog.create({
        data: {
          nodeId: rootNode.id,
          userId: session.user.id,
          action: "NODE_CREATED",
          newValue: { name, allocatedAmount: totalBudget, isRoot: true },
        },
      })

      return { ...proj, rootNode }
    })

    const orgId = session.user.organizationId
    await cacheInvalidate(cacheKey(orgId, "projects"), cacheKey(orgId, "dashboard"))

    return success(project, 201)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
