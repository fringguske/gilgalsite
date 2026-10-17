import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

export const SetUserActiveRequestDto = dto({
  isActive: f.bool(),
})
export type SetUserActiveRequestDto = InferDto<typeof SetUserActiveRequestDto>
