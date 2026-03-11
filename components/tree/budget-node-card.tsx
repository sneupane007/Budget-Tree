"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { NodeStatusBadge } from "@/components/nodes/node-status-badge"
import { formatCurrency, calcBudgetPercent } from "@/lib/utils"
import { useStore } from "@/store"
import { cn } from "@/lib/utils"
import type { BudgetNodeWithOwner } from "@/store/slices/tree-slice"
import type { NodeStatus } from "@prisma/client"

const borderColors: Record<NodeStatus, string> = {
  PLANNED: "border-gray-200",
  IN_PROGRESS: "border-blue-300",
  PENDING_VERIFICATION: "border-amber-300",
  VERIFIED: "border-green-400",
  FLAGGED: "border-orange-400",
  OVERSPENT: "border-red-500",
}

export const BudgetNodeCard = memo(function BudgetNodeCard({ data }: NodeProps<BudgetNodeWithOwner>) {
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const isSelected = selectedNodeId === data.id
  const pct = calcBudgetPercent(data.spentAmount.toString(), data.allocatedAmount.toString())

  return (
    <>
      {data.parentId && <Handle type="target" position={Position.Top} className="!bg-gray-300" />}
      <div
        className={cn(
          "w-52 bg-white rounded-lg shadow-sm border-2 p-3 cursor-pointer transition-shadow",
          borderColors[data.status],
          isSelected && "shadow-md ring-2 ring-offset-1 ring-blue-500"
        )}
      >
        <div className="flex items-start justify-between gap-1 mb-2">
          <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">
            {data.name}
          </p>
          <NodeStatusBadge status={data.status} />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Allocated</span>
            <span className="font-medium text-gray-900">
              {formatCurrency(data.allocatedAmount.toString(), data.currency)}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1">
            <div
              className={cn(
                "h-1 rounded-full transition-all",
                pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-green-500"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {formatCurrency(data.spentAmount.toString(), data.currency)} spent
            </span>
            <span className="text-muted-foreground">{Math.round(pct)}%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 truncate">
          {data.owner.name}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-300" />
    </>
  )
})
