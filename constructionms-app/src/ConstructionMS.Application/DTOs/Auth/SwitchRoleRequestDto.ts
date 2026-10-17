import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

export const SwitchRoleRequestDto = dto({
  role: f.string().required().stringLength(80, 2),
})
export type SwitchRoleRequestDto = InferDto<typeof SwitchRoleRequestDto>
