import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

/** Optional, append-only note explaining a workflow action. */
export const PurchaseOrderActionRequestDto = dto({
  notes: f.string().nullable().stringLength(1_000),
})
export type PurchaseOrderActionRequestDto = InferDto<typeof PurchaseOrderActionRequestDto>
