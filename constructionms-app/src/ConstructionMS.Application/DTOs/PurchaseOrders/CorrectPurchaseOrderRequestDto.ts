import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

export const CorrectPurchaseOrderRequestDto = dto({
  expectedDeliveryDate: f.dateOnly().nullable().required(),
  deliveryLocation: f.string().nullable().stringLength(300),
  notes: f.string().nullable().stringLength(1_000),
  reason: f.string().required().stringLength(1_000, 3),
})
export type CorrectPurchaseOrderRequestDto = InferDto<typeof CorrectPurchaseOrderRequestDto>
