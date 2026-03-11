"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateNodeSchema, type CreateNodeInput } from "@/lib/validators/node"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/store"
import { useAvailableBudget } from "@/store/selectors"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"

interface Props {
  parentNodeId: string
  projectId: string
  onClose: () => void
}

export function AddNodeDialog({ parentNodeId, projectId, onClose }: Props) {
  const { addNode, orgUsers, nodes } = useStore()
  const available = useAvailableBudget(parentNodeId)
  const parentNode = nodes[parentNodeId]

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateNodeInput>({
    resolver: zodResolver(CreateNodeSchema),
    defaultValues: {
      parentId: parentNodeId,
      currency: parentNode?.currency ?? "USD",
    },
  })

  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setValue("parentId", parentNodeId)
  }, [parentNodeId, setValue])

  async function onSubmit(data: CreateNodeInput) {
    setIsLoading(true)
    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Failed to create node")
        return
      }
      addNode(json.data)
      toast.success("Node created")
      onClose()
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Child Node</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Parent: <span className="font-medium text-gray-900">{parentNode?.name}</span>
          {" — "}Available: <span className="font-medium text-green-600">{formatCurrency(available, parentNode?.currency)}</span>
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register("parentId")} />
          <div className="space-y-1">
            <Label>Node Name</Label>
            <Input placeholder="Roads — Phase 1" {...register("name")} />
            {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Input placeholder="Brief description..." {...register("description")} />
          </div>
          <div className="space-y-1">
            <Label>Allocated Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={available}
              placeholder="0.00"
              {...register("allocatedAmount")}
            />
            {errors.allocatedAmount && (
              <p className="text-xs text-red-600">{errors.allocatedAmount.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Owner</Label>
            <Select onValueChange={(v) => setValue("ownerId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select owner" />
              </SelectTrigger>
              <SelectContent>
                {orgUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ownerId && <p className="text-xs text-red-600">{errors.ownerId.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Node"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
