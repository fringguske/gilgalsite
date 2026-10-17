import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'

export const UpdateProjectAssignmentsRequestDto = dto({
  projectIds: f.list(f.int()),
})
export type UpdateProjectAssignmentsRequestDto = InferDto<typeof UpdateProjectAssignmentsRequestDto>
