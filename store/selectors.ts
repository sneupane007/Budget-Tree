import Decimal from "decimal.js"
import { useStore } from "./index"
import { useShallow } from "zustand/react/shallow"

export const useSelectedNode = () =>
  useStore((state) => (state.selectedNodeId ? state.nodes[state.selectedNodeId] : null))

export const useNodeChildren = (parentId: string) =>
  useStore(useShallow((state) => Object.values(state.nodes).filter((n) => n.parentId === parentId)))

export const useTreeHealth = () =>
  useStore(useShallow((state) => {
    const allNodes = Object.values(state.nodes)
    return {
      overspentCount: allNodes.filter((n) => n.status === "OVERSPENT").length,
      pendingCount: allNodes.filter((n) => n.status === "PENDING_VERIFICATION").length,
      totalNodes: allNodes.length,
    }
  }))

// Returns a string to keep the selector result a stable primitive.
// Use new Decimal(available) in consuming code if arithmetic is needed.
export const useAvailableBudget = (nodeId: string) =>
  useStore((state) => {
    const node = state.nodes[nodeId]
    if (!node) return "0"
    const childrenSum = Object.values(state.nodes)
      .filter((n) => n.parentId === nodeId)
      .reduce((sum, n) => sum.add(new Decimal(n.allocatedAmount.toString())), new Decimal(0))
    return new Decimal(node.allocatedAmount.toString()).sub(childrenSum).toString()
  })
