import { z } from "zod"
import { positiveAmount } from "./money"

export const CreateNodeSchema = z.object({
  name: z.string().min(2, "Node name must be at least 2 characters"),
  description: z.string().optional(),
  allocatedAmount: positiveAmount(),
  currency: z.string().min(1),
  parentId: z.string().cuid("Invalid parent node ID"),
  ownerId: z.string().cuid("Invalid owner ID"),
})

export const UpdateNodeSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  ownerId: z.string().cuid().optional(),
  approverId: z.string().cuid().optional(),
})

export const AllocateNodeSchema = z.object({
  allocatedAmount: positiveAmount(),
  reason: z.string().optional(),
})

export const UpdateNodeStatusSchema = z.object({
  status: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "PENDING_VERIFICATION",
    "VERIFIED",
    "FLAGGED",
    "OVERSPENT",
  ]),
  note: z.string().optional(),
})

export const SpendUpdateSchema = z.object({
  amount: positiveAmount(),
  note: z.string().optional(),
})

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>
export type AllocateNodeInput = z.infer<typeof AllocateNodeSchema>
export type UpdateNodeStatusInput = z.infer<typeof UpdateNodeStatusSchema>
export type SpendUpdateInput = z.infer<typeof SpendUpdateSchema>
