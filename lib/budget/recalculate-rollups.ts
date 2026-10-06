import { Prisma } from "@prisma/client"

// Locks the node and all of its ancestors in one statement, ordered by id.
// Every spend locks its chain in the same global order, so concurrent spends
// serialize instead of deadlocking or losing updates.
export async function lockNodeChain(
  nodeId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$queryRaw`
    WITH RECURSIVE chain AS (
      SELECT id, "parentId" FROM "BudgetNode" WHERE id = ${nodeId}
      UNION ALL
      SELECT bn.id, bn."parentId"
      FROM "BudgetNode" bn
      INNER JOIN chain c ON bn.id = c."parentId"
    )
    SELECT id FROM "BudgetNode"
    WHERE id IN (SELECT id FROM chain)
    ORDER BY id
    FOR UPDATE
  `
}

// Adds `delta` to the spentAmount of every ancestor of nodeId (not the node
// itself) and flips an ancestor to OVERSPENT when its total passes its
// allocation. Incremental, so a parent's own direct spend is preserved and
// every level of the tree (grandparents, root) is updated. Call inside the
// same transaction, after lockNodeChain(). Returns the updated ancestor ids.
export async function rollUpSpend(
  nodeId: string,
  delta: string,
  tx: Prisma.TransactionClient
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId"
      FROM "BudgetNode"
      WHERE id = (SELECT "parentId" FROM "BudgetNode" WHERE id = ${nodeId})
      UNION ALL
      SELECT bn.id, bn."parentId"
      FROM "BudgetNode" bn
      INNER JOIN ancestors a ON bn.id = a."parentId"
    )
    UPDATE "BudgetNode"
    SET
      "spentAmount" = "spentAmount" + ${delta}::numeric,
      status = CASE
        WHEN "spentAmount" + ${delta}::numeric > "allocatedAmount"
          THEN 'OVERSPENT'::"NodeStatus"
        ELSE status
      END,
      "updatedAt" = NOW()
    WHERE id IN (SELECT id FROM ancestors)
    RETURNING id
  `
  return rows.map((r) => r.id)
}
