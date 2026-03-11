import { useStore } from "./index"

export const useSelectedNode = () =>
  useStore((state) => (state.selectedNodeId ? state.nodes[state.selectedNodeId] : null))

export const useNodeChildren = (parentId: string) =>
  useStore((state) => Object.values(state.nodes).filter((n) => n.parentId === parentId))

export const useTreeHealth = () =>
  useStore((state) => {
    const allNodes = Object.values(state.nodes)
    return {
      overspentCount: allNodes.filter((n) => n.status === "OVERSPENT").length,
      pendingCount: allNodes.filter((n) => n.status === "PENDING_VERIFICATION").length,
      totalNodes: allNodes.length,
    }
  })

export const useAvailableBudget = (nodeId: string) =>
  useStore((state) => {
    const node = state.nodes[nodeId]
    if (!node) return 0
    const childrenSum = Object.values(state.nodes)
      .filter((n) => n.parentId === nodeId)
      .reduce((sum, n) => sum + parseFloat(n.allocatedAmount.toString()), 0)
    return parseFloat(node.allocatedAmount.toString()) - childrenSum
  })
