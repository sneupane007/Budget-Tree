"use client"

import { useRef } from "react"
import useSWRInfinite from "swr/infinite"
import { fetcher } from "@/lib/fetcher"
import { formatRelativeTime } from "@/lib/utils"
import {
  FileText,
  PenLine,
  Tag,
  AlertTriangle,
  Plus,
  Edit,
  DollarSign,
} from "lucide-react"
import { toast } from "sonner"

const actionIcons: Record<string, React.ElementType> = {
  NODE_CREATED: Plus,
  NODE_UPDATED: Edit,
  BUDGET_AMENDED: DollarSign,
  RECEIPT_UPLOADED: FileText,
  SIGNATURE_ADDED: PenLine,
  STATUS_CHANGED: Tag,
  FLAG_RAISED: AlertTriangle,
  SPEND_RECORDED: DollarSign,
}

interface AuditEntry {
  id: string
  action: string
  timestamp: Date
  user: { name: string; email: string }
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
}

interface AuditPage {
  items: AuditEntry[]
  nextCursor: string | null
  hasMore: boolean
}

export function AuditTimeline({ nodeId }: { nodeId: string }) {
  const loaderRef = useRef<HTMLDivElement>(null)

  const getKey = (pageIndex: number, prev: AuditPage | null) => {
    if (prev && !prev.hasMore) return null
    const cursor = prev?.nextCursor
    return cursor
      ? `/api/audit/${nodeId}?cursor=${cursor}`
      : `/api/audit/${nodeId}`
  }

  const { data, isValidating, setSize, error } = useSWRInfinite<AuditPage>(
    getKey,
    fetcher,
    { revalidateOnFocus: false, revalidateFirstPage: false, dedupingInterval: 30_000,
      onError: () => toast.error("Failed to load audit log") }
  )

  const pages = data ?? []
  const logs = pages.flatMap((p) => p.items)
  const hasMore = pages[pages.length - 1]?.hasMore ?? false

  // Trigger next page when sentinel enters view
  const observerCallback = (entries: IntersectionObserverEntry[]) => {
    if (entries[0]?.isIntersecting && hasMore && !isValidating) {
      setSize((s) => s + 1)
    }
  }

  const setLoaderRef = (el: HTMLDivElement | null) => {
    if (!el) return
    ;(loaderRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.5 })
    observer.observe(el)
  }

  if (!isValidating && !error && logs.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet</p>
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const Icon = actionIcons[log.action] ?? Tag
        return (
          <div key={log.id} className="flex items-start gap-2.5">
            <div className="shrink-0 h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
              <Icon className="h-3 w-3 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs">
                <span className="font-medium">{log.user.name}</span>{" "}
                <span className="text-muted-foreground">
                  {log.action.replace(/_/g, " ").toLowerCase()}
                </span>
              </p>
              {log.newValue && typeof log.newValue === "object" && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {Object.entries(log.newValue as Record<string, unknown>)
                    .filter(([k]) => k !== "reason")
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(log.timestamp)}
            </span>
          </div>
        )
      })}
      <div ref={setLoaderRef} className="text-center py-1">
        {isValidating && <p className="text-xs text-muted-foreground">Loading...</p>}
      </div>
    </div>
  )
}
