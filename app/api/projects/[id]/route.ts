import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession } from "@/lib/auth-helpers"
import { UpdateProjectSchema } from "@/lib/validators/project"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()

    const project = await prisma.project.findFirst({
      where: { id, organizationId: session.user.organizationId },
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
    return success({ ...project, nodes: serializedNodes })
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

    const project = await prisma.project.findFirst({
      where: { id, organizationId: session.user.organizationId },
    })
    if (!project) return error("Project not found", 404)

    const body = await req.json()
    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.project.update({
      where: { id },
      data: parsed.data,
    })

    return success(updated)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
