import { Prisma } from "@prisma/client"

export async function recalculateRollups(
  nodeId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  // Walk upward from nodeId using recursive CTE, then update each ancestor's
  // spentAmount to the sum of its direct children's spentAmount.
  await tx.$executeRaw`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS lvl
      FROM "BudgetNode"
      WHERE id = ${nodeId}
      UNION ALL
      SELECT bn.id, bn.parent_id, a.lvl + 1
      FROM "BudgetNode" bn
      INNER JOIN ancestors a ON bn.id = a.parent_id
    ),
    child_sums AS (
      SELECT parent_id, SUM(spent_amount) AS total_spent
      FROM "BudgetNode"
      WHERE parent_id IN (SELECT id FROM ancestors WHERE lvl > 0)
      GROUP BY parent_id
    )
    UPDATE "BudgetNode"
    SET
      spent_amount = COALESCE(cs.total_spent, "BudgetNode".spent_amount),
      status = CASE
        WHEN COALESCE(cs.total_spent, "BudgetNode".spent_amount) > "BudgetNode".allocated_amount
          THEN 'OVERSPENT'::"NodeStatus"
        WHEN status = 'OVERSPENT'::"NodeStatus"
          AND COALESCE(cs.total_spent, "BudgetNode".spent_amount) <= "BudgetNode".allocated_amount
          THEN 'IN_PROGRESS'::"NodeStatus"
        ELSE status
      END,
      updated_at = NOW()
    FROM child_sums cs
    WHERE "BudgetNode".id = cs.parent_id
  `
}
