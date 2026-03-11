import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { RegisterSchema } from "@/lib/validators/auth"
import { success, error, validationError } from "@/lib/api-response"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) return validationError(parsed.error.issues)

    const { name, email, password, orgName, orgType } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return error("Email already registered", 409)

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const org = await tx.organization.create({
        data: { name: orgName, type: orgType },
      })
      return tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          organizationId: org.id,
        },
        select: { id: true, name: true, email: true, role: true, organizationId: true },
      })
    })

    return success(user, 201)
  } catch {
    return error("Internal server error", 500)
  }
}
