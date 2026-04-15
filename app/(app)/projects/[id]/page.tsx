import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"
import { formatCurrency, calcBudgetPercent } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ProjectTreeView } from "@/components/tree/project-tree-view"
import type { BudgetNodeWithOwner } from "@/store/slices/tree-slice"

async function getProject(id: string, orgId: string) {
  const project = await prisma.project.findFirst({
    where: { id, organizationId: orgId },
  })
  if (!project) return null

  const nodes = await prisma.budgetNode.findMany({
    where: { projectId: id },
    include: {
      owner: { select: { id: true, name: true, email: true, role: true } },
      approver: { select: { id: true, name: true, email: true } },
      _count: { select: { receipts: true, signatures: true, children: true } },
    },
    orderBy: [{ depth: "asc" }, { createdAt: "asc" }],
  })

  const orgUsers = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, email: true, role: true },
  })

  const serializedNodes = nodes.map((n) => ({
    ...n,
    allocatedAmount: n.allocatedAmount.toString(),
    spentAmount: n.spentAmount.toString(),
  })) as BudgetNodeWithOwner[]

  return { project, nodes: serializedNodes, orgUsers }
}

const statusColor = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-gray-100 text-gray-700",
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const data = await getProject(params.id, session!.user.organizationId)
  if (!data) notFound()

  const { project, nodes, orgUsers } = data
  const rootNode = nodes.find((n) => n.isRoot)
  const totalBudget = rootNode?.allocatedAmount?.toString() ?? "0"
  const totalSpent = rootNode?.spentAmount?.toString() ?? "0"
  const pct = calcBudgetPercent(totalSpent, totalBudget)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[project.status]}`}>
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="text-right space-y-1 min-w-40">
          <p className="text-sm text-muted-foreground">
            {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)}
          </p>
          <Progress
            value={pct}
            className={`h-2 ${pct > 90 ? "[&>div]:bg-red-500" : pct > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`}
          />
          <p className="text-xs text-muted-foreground">{Math.round(pct)}% spent</p>
        </div>
      </div>

      {/* Tree view */}
      <ProjectTreeView
        projectId={project.id}
        initialNodes={nodes}
        orgUsers={orgUsers}
        session={session!}
      />
    </div>
  )
}
