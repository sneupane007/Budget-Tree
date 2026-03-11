import type { StateCreator } from "zustand"
import type { Node, Edge } from "reactflow"
import dagre from "dagre"
import type { BudgetNode, User } from "@prisma/client"

export type BudgetNodeWithOwner = BudgetNode & {
  owner: Pick<User, "id" | "name" | "email" | "role">
  approver?: Pick<User, "id" | "name" | "email"> | null
  _count?: { receipts: number; signatures: number; children: number }
}

export interface TreeSlice {
  nodes: Record<string, BudgetNodeWithOwner>
  selectedNodeId: string | null
  flowNodes: Node[]
  flowEdges: Edge[]
  setNodes: (nodes: BudgetNodeWithOwner[]) => void
  selectNode: (id: string | null) => void
  addNode: (node: BudgetNodeWithOwner) => void
  updateNode: (id: string, patch: Partial<BudgetNodeWithOwner>) => void
  removeNode: (id: string) => void
}

function buildFlowElements(nodes: Record<string, BudgetNodeWithOwner>): {
  flowNodes: Node[]
  flowEdges: Edge[]
} {
  const nodeList = Object.values(nodes)
  const flowNodes: Node[] = nodeList.map((n) => ({
    id: n.id,
    type: "budgetNode",
    data: n,
    position: { x: 0, y: 0 },
  }))
  const flowEdges: Edge[] = nodeList
    .filter((n) => n.parentId)
    .map((n) => ({
      id: `${n.parentId}-${n.id}`,
      source: n.parentId!,
      target: n.id,
      type: "smoothstep",
    }))

  return applyDagreLayout(flowNodes, flowEdges)
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): { flowNodes: Node[]; flowEdges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))

  nodes.forEach((n) => g.setNode(n.id, { width: 220, height: 100 }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const positioned = nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 110, y: pos.y - 50 } }
  })
  return { flowNodes: positioned, flowEdges: edges }
}

export const createTreeSlice: StateCreator<TreeSlice, [], [], TreeSlice> = (set) => ({
  nodes: {},
  selectedNodeId: null,
  flowNodes: [],
  flowEdges: [],

  setNodes(nodeList) {
    const nodeMap = Object.fromEntries(nodeList.map((n) => [n.id, n]))
    const { flowNodes, flowEdges } = buildFlowElements(nodeMap)
    set({ nodes: nodeMap, flowNodes, flowEdges })
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  addNode(node) {
    set((state) => {
      const nodes = { ...state.nodes, [node.id]: node }
      const { flowNodes, flowEdges } = buildFlowElements(nodes)
      return { nodes, flowNodes, flowEdges }
    })
  },

  updateNode(id, patch) {
    set((state) => {
      if (!state.nodes[id]) return {}
      const nodes = { ...state.nodes, [id]: { ...state.nodes[id], ...patch } }
      const { flowNodes, flowEdges } = buildFlowElements(nodes)
      return { nodes, flowNodes, flowEdges }
    })
  },

  removeNode(id) {
    set((state) => {
      const { [id]: _removed, ...nodes } = state.nodes
      const { flowNodes, flowEdges } = buildFlowElements(nodes)
      const selectedNodeId = state.selectedNodeId === id ? null : state.selectedNodeId
      return { nodes, flowNodes, flowEdges, selectedNodeId }
    })
  },
})
