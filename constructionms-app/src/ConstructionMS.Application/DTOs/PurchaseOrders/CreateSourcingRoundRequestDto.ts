import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

export const CreateSourcingRoundRequestDto = dto({
  requisitionId: f.int().range(1, INT_MAX),
  quoteDueAt: f.dateTime().nullable(),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreateSourcingRoundRequestDto = InferDto<typeof CreateSourcingRoundRequestDto>
