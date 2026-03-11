"use client"

import { useEffect } from "react"
import { useStore } from "@/store"
import { BudgetTreeCanvas } from "./budget-tree-canvas"
import { NodeDetailPanel } from "./node-detail-panel"
import type { BudgetNodeWithOwner } from "@/store/slices/tree-slice"
import type { Session } from "next-auth"

interface Props {
  projectId: string
  initialNodes: BudgetNodeWithOwner[]
  orgUsers: { id: string; name: string; email: string; role: string }[]
  session: Session
}

export function ProjectTreeView({ projectId, initialNodes, orgUsers, session }: Props) {
  const { setNodes, setOrgUsers, panelOpen } = useStore()

  useEffect(() => {
    setNodes(initialNodes)
    setOrgUsers(orgUsers)
  }, [initialNodes, orgUsers, setNodes, setOrgUsers])

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      <div className={`transition-all duration-200 ${panelOpen ? "flex-1" : "flex-1"}`}>
        <BudgetTreeCanvas projectId={projectId} session={session} />
      </div>
      {panelOpen && (
        <div className="w-96 shrink-0">
          <NodeDetailPanel session={session} />
        </div>
      )}
    </div>
  )
}
