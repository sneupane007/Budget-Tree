import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireSession, requireRole } from "@/lib/auth-helpers"
import { success, error, validationError } from "@/lib/api-response"
import { AuthError } from "@/lib/auth-helpers"
import { z } from "zod"
import bcrypt from "bcryptjs"

const InviteMemberSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "MANAGER", "VERIFIER", "VIEWER"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export async function GET() {
  try {
    const session = await requireSession()
    const members = await prisma.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })
    return success(members)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    requireRole(session, "ADMIN")

    const body = await req.json()
    const parsed = InviteMemberSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) return error("A user with this email already exists", 409)

    const hashed = await bcrypt.hash(parsed.data.password, 12)
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        password: hashed,
        organizationId: session.user.organizationId,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    return success(user)
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, e.status)
    return error("Internal server error", 500)
  }
}
