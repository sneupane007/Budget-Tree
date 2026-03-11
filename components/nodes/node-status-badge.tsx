import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { NodeStatus } from "@prisma/client"

const statusConfig: Record<NodeStatus, { label: string; className: string }> = {
  PLANNED: { label: "Planned", className: "bg-gray-100 text-gray-700 border-gray-200" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-100 text-blue-700 border-blue-200" },
  PENDING_VERIFICATION: { label: "Pending", className: "bg-amber-100 text-amber-700 border-amber-200" },
  VERIFIED: { label: "Verified", className: "bg-green-100 text-green-700 border-green-200" },
  FLAGGED: { label: "Flagged", className: "bg-orange-100 text-orange-700 border-orange-200" },
  OVERSPENT: { label: "Overspent", className: "bg-red-100 text-red-700 border-red-200" },
}

export function NodeStatusBadge({ status }: { status: NodeStatus }) {
  const config = statusConfig[status]
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  )
}
