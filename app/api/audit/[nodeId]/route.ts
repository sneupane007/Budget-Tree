import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { success, error } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function GET(
  req: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get("cursor")
    const take = 20

    const node = await prisma.budgetNode.findFirst({
      where: {
        id: params.nodeId,
        project: { organizationId: session.user.organizationId },
      },
    })
    if (!node) return error("Node not found", 404)

    const logs = await prisma.auditLog.findMany({
      where: { nodeId: params.nodeId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = logs.length > take
    const items = hasMore ? logs.slice(0, take) : logs
    const nextCursor = hasMore ? items[items.length - 1]?.id : null

    return success({ items, nextCursor, hasMore })
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
