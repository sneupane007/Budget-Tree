"use client"

import { useState } from "react"
import { useStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import type { Session } from "next-auth"

interface Props {
  nodeId: string
  allocatedAmount: string
  spentAmount: string
  currency: string
  session: Session
}

export function NodeAllocateTab({ nodeId, allocatedAmount, spentAmount, currency, session }: Props) {
  const { updateNode } = useStore()
  const canEdit = session.user.role === "ADMIN" || session.user.role === "MANAGER"

  const allocated = parseFloat(allocatedAmount)
  const spent = parseFloat(spentAmount)
  const remaining = allocated - spent

  const [newAmount, setNewAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  async function handleReallocate() {
    const amount = parseFloat(newAmount)
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/allocate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocatedAmount: newAmount, reason }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Failed to reallocate")
        return
      }
      updateNode(nodeId, {
        allocatedAmount: json.data.allocatedAmount,
      })
      toast.success("Budget reallocated")
      setNewAmount("")
      setReason("")
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Allocated</p>
          <p className="text-sm font-semibold">{formatCurrency(allocated, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Spent</p>
          <p className="text-sm font-semibold">{formatCurrency(spent, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className={`text-sm font-semibold ${remaining < 0 ? "text-red-600" : "text-green-600"}`}>
            {formatCurrency(remaining, currency)}
          </p>
        </div>
      </div>

      {canEdit ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">New Allocated Amount ({currency})</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder={allocatedAmount}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              placeholder="e.g. Budget revision Q2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={handleReallocate}
            disabled={isLoading || !newAmount}
          >
            {isLoading ? "Reallocating..." : "Reallocate Budget"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center">
          Admin or Manager role required to reallocate budget.
        </p>
      )}
    </div>
  )
}
