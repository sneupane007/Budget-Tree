import { z } from "zod"

export const SubmitSignatureSchema = z.object({
  signatureDataUrl: z
    .string()
    .startsWith("data:image/png;base64,", "Signature must be a PNG data URL"),
  signerName: z.string().min(2, "Name must be at least 2 characters"),
  signerEmail: z.string().email("Invalid email address"),
  role: z.enum(["OWNER", "APPROVER", "WITNESS"]),
  nodeId: z.string().cuid("Invalid node ID"),
})

export type SubmitSignatureInput = z.infer<typeof SubmitSignatureSchema>
