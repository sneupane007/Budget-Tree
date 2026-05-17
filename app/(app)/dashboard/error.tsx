"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Database, RefreshCw } from "lucide-react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string; code?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const isDbDown = error.message?.includes("Can't reach database server") || (error as any).code === "P1001"

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            {isDbDown ? (
              <Database className="h-12 w-12 text-yellow-500" />
            ) : (
              <AlertTriangle className="h-12 w-12 text-red-500" />
            )}
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {isDbDown ? "Database unavailable" : "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isDbDown
                ? "The database is temporarily unreachable. This usually means it's paused or restarting."
                : "An unexpected error occurred while loading the dashboard."}
            </p>
          </div>
          <Button onClick={reset} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
