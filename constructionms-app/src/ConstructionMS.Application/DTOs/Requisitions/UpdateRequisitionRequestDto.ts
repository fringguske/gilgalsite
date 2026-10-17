import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

/** Editable fields for a pending requisition. */
export const UpdateRequisitionRequestDto = dto({
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type UpdateRequisitionRequestDto = InferDto<typeof UpdateRequisitionRequestDto>
