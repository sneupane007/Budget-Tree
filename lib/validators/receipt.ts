import { z } from "zod"
import { positiveAmount } from "./money"

export const UploadReceiptSchema = z.object({
  amount: positiveAmount(),
  vendor: z.string().optional(),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
})

export type UploadReceiptInput = z.infer<typeof UploadReceiptSchema>
