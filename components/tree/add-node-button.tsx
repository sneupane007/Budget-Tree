"use client"

import { useStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { AddNodeDialog } from "@/components/nodes/add-node-dialog"
import type { Session } from "next-auth"

interface Props {
  projectId: string
  session: Session
}

export function AddNodeButton({ projectId, session }: Props) {
  const { selectedNodeId, isAddNodeDialogOpen, openAddNodeDialog, closeAddNodeDialog } = useStore()
  const role = session.user.role

  if (role === "VIEWER" || role === "VERIFIER") return null

  return (
    <>
      <Button
        size="sm"
        disabled={!selectedNodeId}
        onClick={openAddNodeDialog}
        title={selectedNodeId ? "Add child node" : "Select a node first"}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add Child
      </Button>
      {isAddNodeDialogOpen && selectedNodeId && (
        <AddNodeDialog
          parentNodeId={selectedNodeId}
          projectId={projectId}
          onClose={closeAddNodeDialog}
        />
      )}
    </>
  )
}
