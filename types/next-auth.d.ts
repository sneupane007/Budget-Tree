import { Role } from "@prisma/client"
import type { DefaultSession } from "next-auth"
import type { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      organizationId: string
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    organizationId: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: Role
    organizationId: string
  }
}
