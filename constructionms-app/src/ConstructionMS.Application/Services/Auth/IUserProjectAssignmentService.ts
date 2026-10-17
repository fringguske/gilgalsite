import type { AssignedProjectDto } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'

export interface IUserProjectAssignmentService {
  getAssignmentsAsync(userId: number): Promise<AssignedProjectDto[]>
  replaceAssignmentsAsync(userId: number, projectIds: readonly number[], assignedByUserId: number): Promise<AssignedProjectDto[]>
}
