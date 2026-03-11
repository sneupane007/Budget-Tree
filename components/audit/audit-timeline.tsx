"use client"

import { useEffect, useRef, useState, useCallback } from "react"
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

export function AuditTimeline({ nodeId }: { nodeId: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const url = reset
        ? `/api/audit/${nodeId}`
        : `/api/audit/${nodeId}${cursor ? `?cursor=${cursor}` : ""}`
      const res = await fetch(url)
      const json = await res.json()
      if (json.data) {
        setLogs((prev) => (reset ? json.data.items : [...prev, ...json.data.items]))
        setCursor(json.data.nextCursor)
        setHasMore(json.data.hasMore)
      }
    } catch {
      toast.error("Failed to load audit log")
    } finally {
      setLoading(false)
    }
  }, [nodeId, cursor])

  useEffect(() => {
    fetchLogs(true)
  }, [nodeId])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          fetchLogs()
        }
      },
      { threshold: 0.5 }
    )
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, fetchLogs])

  if (!loading && logs.length === 0) {
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
      <div ref={loaderRef} className="text-center py-1">
        {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
      </div>
    </div>
  )
}
