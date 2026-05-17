import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { success, error } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { cacheKey, cacheGet, cacheSet } from "@/lib/cache"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    const { nodeId } = await params
    const session = await requireSession()
    const orgId = session.user.organizationId
    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get("cursor")
    const take = 20

    const key = cacheKey(orgId, "audit", nodeId, cursor ?? "first")
    const cached = await cacheGet(key)
    if (cached) return success(cached)

    const node = await prisma.budgetNode.findFirst({
      where: {
        id: nodeId,
        project: { organizationId: orgId },
      },
    })
    if (!node) return error("Node not found", 404)

    const logs = await prisma.auditLog.findMany({
      where: { nodeId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = logs.length > take
    const items = hasMore ? logs.slice(0, take) : logs
    const nextCursor = hasMore ? items[items.length - 1]?.id : null
    const data = { items, nextCursor, hasMore }

    await cacheSet(key, data, 30)
    return success(data)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
