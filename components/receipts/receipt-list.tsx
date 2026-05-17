"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FileText, Image, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import type { Receipt } from "@prisma/client"

interface NodeWithReceipts {
  receipts: (Receipt & { amount: string })[]
}

export function ReceiptList({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useSWR<NodeWithReceipts>(`/api/nodes/${nodeId}`, fetcher)
  const receipts = data?.receipts ?? []

  async function openReceipt(receiptId: string) {
    try {
      const res = await fetch(`/api/receipts/${receiptId}`)
      const json = await res.json()
      if (json.data?.signedUrl) {
        window.open(json.data.signedUrl, "_blank")
      }
    } catch {
      toast.error("Failed to open receipt")
    }
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading receipts...</p>
  if (receipts.length === 0)
    return <p className="text-xs text-muted-foreground">No receipts uploaded yet</p>

  return (
    <div className="space-y-2">
      {receipts.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 p-2 rounded-md border hover:bg-gray-50 transition-colors"
        >
          {r.fileType.startsWith("image/") ? (
            <Image className="h-4 w-4 text-blue-500 shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-red-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              {r.vendor ?? "Receipt"} — {formatCurrency(r.amount)}
            </p>
            {r.receiptDate && (
              <p className="text-xs text-muted-foreground">{formatDate(r.receiptDate)}</p>
            )}
          </div>
          <button
            onClick={() => openReceipt(r.id)}
            className="text-muted-foreground hover:text-gray-900 shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
