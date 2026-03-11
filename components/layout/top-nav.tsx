"use client"

import { signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import type { Role } from "@prisma/client"

const roleColors: Record<Role, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  VERIFIER: "bg-amber-100 text-amber-700",
  VIEWER: "bg-gray-100 text-gray-700",
}

interface Props {
  user: { name?: string | null; email?: string | null; role: Role }
}

export function TopNav({ user }: Props) {
  const pathname = usePathname()
  const parts = pathname.split("/").filter(Boolean)

  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span>/</span>}
            <span className={i === parts.length - 1 ? "text-gray-900 font-medium" : ""}>
              {part.charAt(0).toUpperCase() + part.slice(1)}
            </span>
          </span>
        ))}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[user.role]}`}>
            {user.role}
          </span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-gray-200">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>
            <p className="font-medium text-sm">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
