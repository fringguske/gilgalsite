import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** Creates a material request. Requester identity is supplied by the authenticated API principal. */
export const CreateRequisitionV1RequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  materialId: f.int().range(1, INT_MAX),
  costCodeId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  neededByDate: f.dateOnly(),
  purpose: f.string().required().stringLength(500, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreateRequisitionV1RequestDto = InferDto<typeof CreateRequisitionV1RequestDto>
