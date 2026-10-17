import type { MyTasksResponseDto } from '../../DTOs/Tasks/TaskDtos'

export interface IMyTasksService {
  getMyTasksAsync(
    userId: number,
    requestedRole?: string | null,
    projectId?: number | null,
    overdueOnly?: boolean,
  ): Promise<MyTasksResponseDto>
}
