import { prisma } from "@/lib/db"
import Decimal from "decimal.js"

export async function validateAllocation(
  parentId: string,
  requestedAmount: Decimal,
  excludeNodeId?: string
): Promise<{ valid: boolean; available: Decimal; message?: string }> {
  const parent = await prisma.budgetNode.findUnique({
    where: { id: parentId },
    include: {
      children: {
        select: { id: true, allocatedAmount: true },
      },
    },
  })

  if (!parent) {
    return { valid: false, available: new Decimal(0), message: "Parent node not found" }
  }

  type ChildRef = { id: string; allocatedAmount: { toString(): string } }
  const siblings: ChildRef[] = excludeNodeId
    ? parent.children.filter((c: ChildRef) => c.id !== excludeNodeId)
    : parent.children

  const allocatedToChildren = siblings.reduce(
    (sum: Decimal, child: ChildRef) => sum.add(new Decimal(child.allocatedAmount.toString())),
    new Decimal(0)
  )

  const available = new Decimal(parent.allocatedAmount.toString()).sub(allocatedToChildren)

  if (requestedAmount.gt(available)) {
    return {
      valid: false,
      available,
      message: `Insufficient budget. Available: ${available.toFixed(2)}, Requested: ${requestedAmount.toFixed(2)}`,
    }
  }

  return { valid: true, available }
}
