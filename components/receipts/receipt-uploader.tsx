"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, FileText, Image, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const ACCEPTED_TYPES = {
  "image/jpeg": [],
  "image/png": [],
  "image/webp": [],
  "application/pdf": [],
}

interface Props {
  nodeId: string
  onUploaded?: () => void
}

export function ReceiptUploader({ nodeId, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [amount, setAmount] = useState("")
  const [vendor, setVendor] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDropRejected: (rejections) => {
      const msg = rejections[0]?.errors[0]?.message ?? "Invalid file"
      toast.error(msg)
    },
  })

  async function upload() {
    if (!file || !amount) {
      toast.error("File and amount are required")
      return
    }
    setIsLoading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("nodeId", nodeId)
      form.append("amount", amount)
      if (vendor) form.append("vendor", vendor)

      const res = await fetch("/api/receipts", { method: "POST", body: form })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Upload failed")
        return
      }
      toast.success("Receipt uploaded")
      setFile(null)
      setAmount("")
      setVendor("")
      onUploaded?.()
    } catch {
      toast.error("Upload failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex items-center justify-center gap-2">
            {file.type.startsWith("image/") ? (
              <Image className="h-4 w-4 text-blue-500" />
            ) : (
              <FileText className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium truncate max-w-40">{file.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
              }}
              className="text-muted-foreground hover:text-gray-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="h-6 w-6 text-gray-400 mx-auto" />
            <p className="text-xs text-muted-foreground">
              Drop receipt here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">JPG, PNG, PDF up to 10MB</p>
          </div>
        )}
      </div>

      {file && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Amount *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input
              placeholder="Vendor name"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {file && (
        <Button onClick={upload} disabled={isLoading || !amount} size="sm" className="w-full">
          {isLoading ? "Uploading..." : "Upload Receipt"}
        </Button>
      )}
    </div>
  )
}
