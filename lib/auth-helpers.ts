import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import type { Session } from "next-auth"
import type { Role } from "@prisma/client"

export async function requireSession(): Promise<Session> {
  const session = await getServerSession(authOptions)
  if (!session) {
    throw new AuthError("Unauthorized", 401)
  }
  return session
}

export function requireRole(session: Session, ...roles: Role[]): void {
  if (!roles.includes(session.user.role)) {
    throw new AuthError("Forbidden", 403)
  }
}

export function withOrgScope(organizationId: string) {
  return { project: { organizationId } }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = "AuthError"
  }
}
