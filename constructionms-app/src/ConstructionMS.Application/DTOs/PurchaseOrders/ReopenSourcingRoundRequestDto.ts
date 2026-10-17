import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

export const ReopenSourcingRoundRequestDto = dto({
  reason: f.string().required().stringLength(1_000, 3),
  quoteDueAt: f.dateTime().nullable(),
})
export type ReopenSourcingRoundRequestDto = InferDto<typeof ReopenSourcingRoundRequestDto>
