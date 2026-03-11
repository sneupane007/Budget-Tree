import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatCurrency, formatRelativeTime } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { NodeStatusBadge } from "@/components/nodes/node-status-badge"
import Link from "next/link"
import { AlertTriangle, FolderOpen, TrendingUp, Wallet } from "lucide-react"
import { Suspense } from "react"

async function getDashboardData(orgId: string) {
  const [activeProjects, nodeAggregates, nodesByStatus, overspentNodes, recentActivity] =
    await Promise.all([
      prisma.project.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
      prisma.budgetNode.aggregate({
        where: { project: { organizationId: orgId }, isRoot: true },
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
          owner: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
        take: 5,
      }),
      prisma.auditLog.findMany({
        where: { user: { organizationId: orgId } },
        include: {
          user: { select: { name: true } },
          node: { select: { id: true, name: true, projectId: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
    ])

  const totalBudget = nodeAggregates._sum.allocatedAmount?.toString() ?? "0"
  const totalSpent = nodeAggregates._sum.spentAmount?.toString() ?? "0"
  const remaining = (parseFloat(totalBudget) - parseFloat(totalSpent)).toString()
  const statusMap = Object.fromEntries(
    nodesByStatus.map((s: { status: string; _count: { status: number } }) => [s.status, s._count.status])
  )

  return { activeProjects, totalBudget, totalSpent, remaining, statusMap, overspentNodes, recentActivity }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const data = await getDashboardData(session!.user.organizationId)
  const spentPercent =
    parseFloat(data.totalBudget) > 0
      ? Math.round((parseFloat(data.totalSpent) / parseFloat(data.totalBudget)) * 100)
      : 0

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Budget health overview across your organization</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(data.totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Spent</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(data.totalSpent)}</p>
            <p className="text-xs text-muted-foreground mt-1">{spentPercent}% of budget</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
            <Wallet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(data.remaining)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.activeProjects}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Node status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Node Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.statusMap).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <NodeStatusBadge status={status as never} />
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(data.statusMap).length === 0 && (
              <p className="text-sm text-muted-foreground">No nodes yet</p>
            )}
          </CardContent>
        </Card>

        {/* Overspent alerts */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <CardTitle className="text-base">Overspent Nodes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overspentNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overspent nodes</p>
            ) : (
              data.overspentNodes.map((node) => (
                <Link
                  key={node.id}
                  href={`/projects/${node.project.id}`}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{node.name}</p>
                    <p className="text-xs text-muted-foreground">{node.project.name}</p>
                  </div>
                  <Badge variant="destructive" className="text-xs">Overspent</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{log.user.name}</span>
                    {" "}
                    <span className="text-muted-foreground">{log.action.replace(/_/g, " ").toLowerCase()}</span>
                    {log.node && (
                      <span> on <span className="font-medium">{log.node.name}</span></span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
