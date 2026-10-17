import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

/** A required reason for a negative or reversal workflow action. */
export const WorkflowReasonRequestDto = dto({
  reason: f.string().required().stringLength(1_000, 3),
})
export type WorkflowReasonRequestDto = InferDto<typeof WorkflowReasonRequestDto>
