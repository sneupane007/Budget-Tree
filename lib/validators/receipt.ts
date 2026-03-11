import { z } from "zod"

export const UploadReceiptSchema = z.object({
  amount: z.string().refine((v) => parseFloat(v) > 0, "Amount must be positive"),
  vendor: z.string().optional(),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
})

export type UploadReceiptInput = z.infer<typeof UploadReceiptSchema>
