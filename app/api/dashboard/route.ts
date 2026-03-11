import { requireSession } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { success, error } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function GET() {
  try {
    const session = await requireSession()
    const orgId = session.user.organizationId

    const [projects, nodeAggregates, nodesByStatus, overspentNodes, recentActivity] =
      await Promise.all([
        prisma.project.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
        prisma.budgetNode.aggregate({
          where: { project: { organizationId: orgId } },
          _sum: { allocatedAmount: true, spentAmount: true },
        }),
        prisma.budgetNode.groupBy({
          by: ["status"],
          where: { project: { organizationId: orgId } },
          _count: { status: true },
        }),
        prisma.budgetNode.findMany({
          where: { status: "OVERSPENT", project: { organizationId: orgId } },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
        prisma.auditLog.findMany({
          where: { user: { organizationId: orgId } },
          include: {
            user: { select: { id: true, name: true, email: true } },
            node: { select: { id: true, name: true, projectId: true } },
          },
          orderBy: { timestamp: "desc" },
          take: 10,
        }),
      ])

    const totalBudget = nodeAggregates._sum.allocatedAmount?.toString() ?? "0"
    const totalSpent = nodeAggregates._sum.spentAmount?.toString() ?? "0"
    const statusMap = Object.fromEntries(
      nodesByStatus.map((s: { status: string; _count: { status: number } }) => [s.status, s._count.status])
    )

    return success({
      activeProjects: projects,
      totalBudget,
      totalSpent,
      nodesByStatus: statusMap,
      overspentNodes,
      recentActivity,
    })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
