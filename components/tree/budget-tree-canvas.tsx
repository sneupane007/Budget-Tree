"use client"

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow"
import "reactflow/dist/style.css"
import { useStore } from "@/store"
import { BudgetNodeCard } from "./budget-node-card"
import { AddNodeButton } from "./add-node-button"
import type { Session } from "next-auth"
import { useCallback } from "react"

const nodeTypes = { budgetNode: BudgetNodeCard }

function Flow({ projectId, session }: { projectId: string; session: Session }) {
  const { flowNodes, flowEdges, selectNode, setPanelOpen } = useStore()
  const { fitView } = useReactFlow()

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id)
      setPanelOpen(true)
    },
    [selectNode, setPanelOpen]
  )

  return (
    <div className="relative w-full h-full rounded-lg border bg-gray-50 overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          selectNode(null)
          setPanelOpen(false)
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} />
        <MiniMap nodeStrokeWidth={2} zoomable pannable className="!bg-white !border !rounded-md" />
      </ReactFlow>
      <div className="absolute top-3 right-3 z-10">
        <AddNodeButton projectId={projectId} session={session} />
      </div>
    </div>
  )
}

export function BudgetTreeCanvas({ projectId, session }: { projectId: string; session: Session }) {
  return (
    <ReactFlowProvider>
      <div className="h-[calc(100vh-12rem)] min-h-96">
        <Flow projectId={projectId} session={session} />
      </div>
    </ReactFlowProvider>
  )
}
