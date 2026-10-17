import { dto, f, type InferDto } from '../../Common/Validation'

/** CEO-controlled policy applied only to purchase orders created after the change. */
export const SetMaterialTechnicalAcceptancePolicyRequestDto = dto({
  required: f.bool().nullable().required(),
})
export type SetMaterialTechnicalAcceptancePolicyRequestDto = InferDto<typeof SetMaterialTechnicalAcceptancePolicyRequestDto>
