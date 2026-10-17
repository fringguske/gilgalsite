import { dto, f, type InferDto } from '../../Common/Validation'

export const CreateCostCodeRequestDto = dto({
  code: f.string().required().stringLength(30, 1),
  name: f.string().required().stringLength(150, 2),
})
export type CreateCostCodeRequestDto = InferDto<typeof CreateCostCodeRequestDto>
