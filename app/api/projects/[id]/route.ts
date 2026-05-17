import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { UpdateProjectSchema } from "@/lib/validators/project"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { cacheKey, cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    const orgId = session.user.organizationId
    const key = cacheKey(orgId, "projects", id)

    const cached = await cacheGet(key)
    if (cached) return success(cached)

    const project = await prisma.project.findFirst({
      where: { id, organizationId: orgId },
    })
    if (!project) return error("Project not found", 404)

    // Fetch all nodes flat — avoid recursive includes
    const nodes = await prisma.budgetNode.findMany({
      where: { projectId: id },
      include: {
        owner: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true } },
        _count: { select: { receipts: true, signatures: true, children: true } },
      },
      orderBy: [{ depth: "asc" }, { createdAt: "asc" }],
    })

    const serializedNodes = nodes.map((n) => ({
      ...n,
      allocatedAmount: n.allocatedAmount.toString(),
      spentAmount: n.spentAmount.toString(),
    }))
    const data = { ...project, nodes: serializedNodes }
    await cacheSet(key, data, 60)
    return success(data)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    const orgId = session.user.organizationId

    const project = await prisma.project.findFirst({
      where: { id, organizationId: orgId },
    })
    if (!project) return error("Project not found", 404)

    const body = await req.json()
    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.project.update({
      where: { id },
      data: parsed.data,
    })

    await cacheInvalidate(cacheKey(orgId, "projects", id), cacheKey(orgId, "projects"))

    return success(updated)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
