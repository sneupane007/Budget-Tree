"use client"

import { useState } from "react"
import { useStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { User } from "lucide-react"
import type { Session } from "next-auth"

interface Props {
  nodeId: string
  ownerId: string
  approverId: string | null | undefined
  session: Session
}

export function NodeAccessTab({ nodeId, ownerId, approverId, session }: Props) {
  const { orgUsers, updateNode } = useStore()
  const canEdit = session.user.role === "ADMIN" || session.user.role === "MANAGER"

  const [selectedOwner, setSelectedOwner] = useState(ownerId)
  const [selectedApprover, setSelectedApprover] = useState(approverId ?? "")
  const [isLoading, setIsLoading] = useState(false)

  async function handleSave() {
    setIsLoading(true)
    try {
      const body: Record<string, string> = { ownerId: selectedOwner }
      if (selectedApprover) body.approverId = selectedApprover

      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Failed to update access")
        return
      }

      const newOwner = orgUsers.find((u) => u.id === selectedOwner)
      const newApprover = orgUsers.find((u) => u.id === selectedApprover)
      updateNode(nodeId, {
        ownerId: selectedOwner,
        owner: newOwner
          ? { id: newOwner.id, name: newOwner.name, email: newOwner.email, role: newOwner.role as never }
          : undefined,
        approverId: selectedApprover || null,
        approver: newApprover
          ? { id: newApprover.id, name: newApprover.name, email: newApprover.email }
          : null,
      })
      toast.success("Access updated")
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const isDirty = selectedOwner !== ownerId || selectedApprover !== (approverId ?? "")

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          Owner
        </Label>
        {canEdit ? (
          <Select value={selectedOwner} onValueChange={setSelectedOwner}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select owner" />
            </SelectTrigger>
            <SelectContent>
              {orgUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} <span className="text-muted-foreground text-xs">({u.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium">
            {orgUsers.find((u) => u.id === ownerId)?.name ?? ownerId}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {orgUsers.find((u) => u.id === selectedOwner)?.email}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          Approver <span className="font-normal">(optional)</span>
        </Label>
        {canEdit ? (
          <Select
            value={selectedApprover || "none"}
            onValueChange={(v) => setSelectedApprover(v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="No approver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {orgUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} <span className="text-muted-foreground text-xs">({u.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium">
            {approverId ? orgUsers.find((u) => u.id === approverId)?.name ?? approverId : "None"}
          </p>
        )}
        {selectedApprover && (
          <p className="text-xs text-muted-foreground">
            {orgUsers.find((u) => u.id === selectedApprover)?.email}
          </p>
        )}
      </div>

      {canEdit && (
        <Button
          size="sm"
          className="w-full"
          onClick={handleSave}
          disabled={isLoading || !isDirty}
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      )}

      {!canEdit && (
        <p className="text-xs text-muted-foreground text-center">
          Admin or Manager role required to change access.
        </p>
      )}
    </div>
  )
}
