import type { DashboardResponseDto } from '@/ConstructionMS.Application/DTOs/Dashboard/DashboardResponseDto'

export interface IDashboardService {
  getAsync(userId: number): Promise<DashboardResponseDto>
}
