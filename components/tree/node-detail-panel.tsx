"use client"

import { useStore } from "@/store"
import { useSelectedNode } from "@/store/selectors"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { NodeStatusBadge } from "@/components/nodes/node-status-badge"
import { ReceiptList } from "@/components/receipts/receipt-list"
import { ReceiptUploader } from "@/components/receipts/receipt-uploader"
import { SignaturePad } from "@/components/signatures/signature-pad"
import { AuditTimeline } from "@/components/audit/audit-timeline"
import { NodeAccessTab } from "@/components/nodes/node-access-tab"
import { NodeAllocateTab } from "@/components/nodes/node-allocate-tab"
import { formatCurrency, calcBudgetPercent, formatDate } from "@/lib/utils"
import { X, User, Calendar } from "lucide-react"
import { mutate as globalMutate } from "swr"
import type { Session } from "next-auth"

export function NodeDetailPanel({ session }: { session: Session }) {
  const node = useSelectedNode()
  const { setPanelOpen, activeTab, setActiveTab, selectNode } = useStore()

  if (!node) return null

  const pct = calcBudgetPercent(node.spentAmount.toString(), node.allocatedAmount.toString())
  const allocated = parseFloat(node.allocatedAmount.toString())
  const spent = parseFloat(node.spentAmount.toString())
  const remaining = allocated - spent

  function close() {
    setPanelOpen(false)
    selectNode(null)
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm leading-tight">{node.name}</CardTitle>
            {node.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.description}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={close}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <NodeStatusBadge status={node.status} />
      </CardHeader>
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="w-full rounded-none border-b bg-transparent h-9 px-3">
            <TabsTrigger value="overview" className="text-xs flex-1">Overview</TabsTrigger>
            <TabsTrigger value="access" className="text-xs flex-1">Access</TabsTrigger>
            <TabsTrigger value="allocate" className="text-xs flex-1">Budget</TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs flex-1">Receipts</TabsTrigger>
            <TabsTrigger value="signature" className="text-xs flex-1">Sign</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs flex-1">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-3 space-y-4 m-0">
            {/* Budget summary */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Budget utilization</span>
                <span className="font-medium">{Math.round(pct)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Allocated</p>
                  <p className="text-sm font-semibold">{formatCurrency(allocated, node.currency)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Spent</p>
                  <p className="text-sm font-semibold">{formatCurrency(spent, node.currency)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`text-sm font-semibold ${remaining < 0 ? "text-red-600" : "text-green-600"}`}>
                    {formatCurrency(remaining, node.currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* Owner */}
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="font-medium">{node.owner.name}</p>
                <p className="text-xs text-muted-foreground">{node.owner.email}</p>
              </div>
            </div>

            {node.approver && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Approver</p>
                  <p className="font-medium">{node.approver.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="font-medium">{formatDate(node.createdAt)}</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="access" className="p-3 m-0">
            <NodeAccessTab
              nodeId={node.id}
              ownerId={node.ownerId}
              approverId={node.approverId}
              session={session}
            />
          </TabsContent>

          <TabsContent value="allocate" className="p-3 m-0">
            <NodeAllocateTab
              nodeId={node.id}
              allocatedAmount={node.allocatedAmount.toString()}
              spentAmount={node.spentAmount.toString()}
              currency={node.currency}
              session={session}
            />
          </TabsContent>

          <TabsContent value="receipts" className="p-3 space-y-3 m-0">
            <ReceiptUploader nodeId={node.id} onUploaded={() => globalMutate(`/api/nodes/${node.id}`)} />
            <ReceiptList nodeId={node.id} />
          </TabsContent>

          <TabsContent value="signature" className="p-3 m-0">
            <SignaturePad nodeId={node.id} session={session} />
          </TabsContent>

          <TabsContent value="audit" className="p-3 m-0">
            <AuditTimeline nodeId={node.id} />
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}
