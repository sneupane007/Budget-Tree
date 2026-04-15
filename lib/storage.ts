import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function uploadReceipt(
  nodeId: string,
  file: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const path = `${nodeId}/${Date.now()}-${filename}`
  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(path, file, { contentType, upsert: false })
  if (error) throw new Error(`Receipt upload failed: ${error.message}`)
  return path
}

export async function uploadSignature(
  nodeId: string,
  dataUrl: string,
  signerEmail: string
): Promise<string> {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/)
  if (!match) throw new Error("Invalid signature data URL: expected PNG base64 data URL")
  const buffer = Buffer.from(match[1], "base64")
  const path = `${nodeId}/${Date.now()}-${signerEmail}.png`
  const { error } = await supabaseAdmin.storage
    .from("signatures")
    .upload(path, buffer, { contentType: "image/png", upsert: false })
  if (error) throw new Error(`Signature upload failed: ${error.message}`)
  return path
}

export async function getSignedUrl(
  bucket: "receipts" | "signatures" | "exports",
  path: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error || !data) throw new Error(`Failed to create signed URL: ${error?.message}`)
  return data.signedUrl
}

export async function deleteFile(
  bucket: "receipts" | "signatures" | "exports",
  path: string
): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path])
  if (error) throw new Error(`Failed to delete file: ${error.message}`)
}
