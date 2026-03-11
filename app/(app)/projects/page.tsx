import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatCurrency, calcBudgetPercent } from "@/lib/utils"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CreateProjectDialog } from "@/components/projects/create-project-dialog"
import { Plus, FolderOpen } from "lucide-react"

async function getProjects(orgId: string) {
  return prisma.project.findMany({
    where: { organizationId: orgId },
    include: {
      rootNode: {
        select: { id: true, allocatedAmount: true, spentAmount: true, status: true },
      },
      _count: { select: { nodes: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

const statusBadge = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ARCHIVED: "bg-gray-100 text-gray-700",
}

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions)
  const projects = await getProjects(session!.user.organizationId)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first project to start tracking budgets
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const allocated = project.rootNode?.allocatedAmount?.toString() ?? "0"
            const spent = project.rootNode?.spentAmount?.toString() ?? "0"
            const pct = calcBudgetPercent(spent, allocated)
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{project.name}</CardTitle>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusBadge[project.status]}`}>
                        {project.status}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{formatCurrency(spent)} spent</span>
                        <span>{formatCurrency(allocated)} total</span>
                      </div>
                      <Progress
                        value={pct}
                        className={`h-1.5 ${pct > 90 ? "[&>div]:bg-red-500" : pct > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{project._count.nodes} nodes</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
