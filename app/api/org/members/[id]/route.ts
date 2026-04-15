import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { z } from "zod"

const UpdateRoleSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "VERIFIER", "VIEWER"]),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await requireSession()
    requireRole(session, "ADMIN")

    const member = await prisma.user.findFirst({
      where: { id, organizationId: session.user.organizationId },
    })
    if (!member) return error("Member not found", 404)

    const body = await req.json()
    const parsed = UpdateRoleSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const updated = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
      select: { id: true, name: true, email: true, role: true },
    })
    return success(updated)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
