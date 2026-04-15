"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { formatRelativeTime } from "@/lib/utils"

type Role = "ADMIN" | "MANAGER" | "VERIFIER" | "VIEWER"

interface Member {
  id: string
  name: string
  email: string
  role: Role
  createdAt: Date | string
}

const roleBadgeClass: Record<Role, string> = {
  ADMIN: "bg-purple-100 text-purple-700",
  MANAGER: "bg-blue-100 text-blue-700",
  VERIFIER: "bg-amber-100 text-amber-700",
  VIEWER: "bg-gray-100 text-gray-600",
}

interface Props {
  members: Member[]
  currentUserId: string
  isAdmin: boolean
}

export function MembersTable({ members: initial, currentUserId, isAdmin }: Props) {
  const [members, setMembers] = useState(initial)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleRoleChange(memberId: string, role: Role) {
    setLoadingId(memberId)
    try {
      const res = await fetch(`/api/org/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update role")
        return
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: json.data.role } : m))
      )
      toast.success("Role updated")
    } catch {
      toast.error("Something went wrong")
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell className="font-medium">
              {member.name}
              {member.id === currentUserId && (
                <span className="ml-2 text-xs text-muted-foreground">(you)</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{member.email}</TableCell>
            <TableCell>
              {isAdmin && member.id !== currentUserId ? (
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member.id, v as Role)}
                  disabled={loadingId === member.id}
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="VERIFIER">Verifier</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge className={`text-xs font-medium ${roleBadgeClass[member.role]}`}>
                  {member.role}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatRelativeTime(new Date(member.createdAt))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
