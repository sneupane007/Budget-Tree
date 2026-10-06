import { z } from "zod"

// Positive money string for the Decimal(18,2) columns: plain digits with at most
// 2 decimals and at most 16 integer digits. Rejects "1e3", "12.345", "-5", "abc"
// (parseFloat accepted several of these) and amounts that would overflow the column.
export const positiveAmount = (message = "Amount must be positive") =>
  z.string().refine((v) => /^\d{1,16}(\.\d{1,2})?$/.test(v) && Number(v) > 0, message)
