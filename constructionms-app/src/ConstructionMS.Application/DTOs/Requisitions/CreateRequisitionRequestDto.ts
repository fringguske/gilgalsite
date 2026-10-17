import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** Request body for creating a material requisition. */
export const CreateRequisitionRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  materialId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  requestedByUserId: f.int().range(1, INT_MAX),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreateRequisitionRequestDto = InferDto<typeof CreateRequisitionRequestDto>
