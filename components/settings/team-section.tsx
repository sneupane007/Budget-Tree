"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MembersTable } from "./members-table"
import { InviteMemberDialog } from "./invite-member-dialog"
import { Users } from "lucide-react"

type Role = "ADMIN" | "MANAGER" | "VERIFIER" | "VIEWER"

interface Member {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
}

interface Props {
  initialMembers: Member[]
  currentUserId: string
  isAdmin: boolean
}

export function TeamSection({ initialMembers, currentUserId, isAdmin }: Props) {
  const [members, setMembers] = useState(initialMembers)

  function handleInvited(newMember: { id: string; name: string; email: string; role: string; createdAt: string }) {
    setMembers((prev) => [...prev, newMember as Member])
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team Members
          </CardTitle>
          {isAdmin && <InviteMemberDialog onInvited={handleInvited} />}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <MembersTable members={members} currentUserId={currentUserId} isAdmin={isAdmin} />
      </CardContent>
    </Card>
  )
}
