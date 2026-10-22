import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** Fields the original foreman may revise before a successful technical check. */
export const UpdateRequisitionV1RequestDto = dto({
  costCodeId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  neededByDate: f.dateOnly(),
  /** Optional work area or purpose; left empty, the request records "Not given". */
  purpose: f.string().nullable().stringLength(500),
  notes: f.string().nullable().stringLength(1_000),
  /** Revision last read by the client; prevents overwriting a newer action. */
  expectedRevision: f.int().range(1, INT_MAX),
})
export type UpdateRequisitionV1RequestDto = InferDto<typeof UpdateRequisitionV1RequestDto>
