"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"

const InviteSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  role: z.enum(["ADMIN", "MANAGER", "VERIFIER", "VIEWER"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type InviteInput = z.infer<typeof InviteSchema>

interface Props {
  onInvited: (member: { id: string; name: string; email: string; role: string; createdAt: string }) => void
}

export function InviteMemberDialog({ onInvited }: Props) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<InviteInput>({
    resolver: zodResolver(InviteSchema),
  })

  async function onSubmit(data: InviteInput) {
    setIsLoading(true)
    try {
      const res = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Failed to invite member")
        return
      }
      onInvited(json.data)
      toast.success(`${data.name} added to the organization`)
      reset()
      setOpen(false)
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Full Name</Label>
            <Input placeholder="Jane Smith" {...register("name")} />
            {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" placeholder="jane@example.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select onValueChange={(v) => setValue("role", v as InviteInput["role"])}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin — full access</SelectItem>
                <SelectItem value="MANAGER">Manager — create & edit nodes</SelectItem>
                <SelectItem value="VERIFIER">Verifier — review & sign</SelectItem>
                <SelectItem value="VIEWER">Viewer — read only</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && <p className="text-xs text-red-600">{errors.role.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Temporary Password</Label>
            <Input type="password" placeholder="Min. 6 characters" {...register("password")} />
            {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Inviting..." : "Send Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
