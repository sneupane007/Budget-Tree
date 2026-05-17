"use client"

import { useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStore } from "@/store"
import { mutate as globalMutate } from "swr"
import { toast } from "sonner"
import type { Session } from "next-auth"

interface Props {
  nodeId: string
  session: Session
}

export function SignaturePad({ nodeId, session }: Props) {
  const sigRef = useRef<SignatureCanvas>(null)
  const [signerName, setSignerName] = useState(session.user.name ?? "")
  const [signerEmail, setSignerEmail] = useState(session.user.email ?? "")
  const [role, setRole] = useState<"OWNER" | "APPROVER" | "WITNESS">("OWNER")
  const [isLoading, setIsLoading] = useState(false)
  const { updateNode } = useStore()

  if (session.user.role === "VIEWER") {
    return <p className="text-sm text-muted-foreground">Viewers cannot submit signatures.</p>
  }

  async function submit() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error("Please draw your signature")
      return
    }
    if (!signerName || !signerEmail) {
      toast.error("Name and email are required")
      return
    }
    setIsLoading(true)
    try {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL("image/png")
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, signatureDataUrl: dataUrl, signerName, signerEmail, role }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Signature submission failed")
        return
      }
      // Refresh node status via SWR cache
      const fresh = await globalMutate(`/api/nodes/${nodeId}`) as { status: string } | undefined
      if (fresh?.status) updateNode(nodeId, { status: fresh.status as import("@prisma/client").NodeStatus })
      toast.success("Signature submitted")
      sigRef.current.clear()
    } catch {
      toast.error("Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Your Name</Label>
          <Input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OWNER">Owner</SelectItem>
              <SelectItem value="APPROVER">Approver</SelectItem>
              <SelectItem value="WITNESS">Witness</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          value={signerEmail}
          onChange={(e) => setSignerEmail(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <div>
        <Label className="text-xs mb-1 block">Draw Signature</Label>
        <div className="border rounded-md overflow-hidden bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="#1a1a1a"
            canvasProps={{ width: 320, height: 120, className: "w-full" }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => sigRef.current?.clear()}
          className="flex-1"
        >
          Clear
        </Button>
        <Button size="sm" onClick={submit} disabled={isLoading} className="flex-1">
          {isLoading ? "Submitting..." : "Submit Signature"}
        </Button>
      </div>
    </div>
  )
}
