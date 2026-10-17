import type { PaginatedResult } from '../../Common/PaginatedResult'
import type { CostCodeResponseDto } from '../../DTOs/Projects/CostCodeResponseDto'
import type { CreateCostCodeRequestDto } from '../../DTOs/Projects/CreateCostCodeRequestDto'
import type { CreateProjectProgressVerificationRequestDto } from '../../DTOs/Projects/CreateProjectProgressVerificationRequestDto'
import type { CreateProjectRequestDto } from '../../DTOs/Projects/CreateProjectRequestDto'
import type { ProjectBudgetResponseDto } from '../../DTOs/Projects/ProjectBudgetResponseDto'
import type { ProjectProgressVerificationResponseDto } from '../../DTOs/Projects/ProjectProgressVerificationResponseDto'
import type { ProjectResponseDto } from '../../DTOs/Projects/ProjectResponseDto'
import type { ProjectSummaryDto } from '../../DTOs/Projects/ProjectSummaryDto'
import type { SetProjectBudgetRequestDto } from '../../DTOs/Projects/SetProjectBudgetRequestDto'
import type { UpdateProjectRequestDto } from '../../DTOs/Projects/UpdateProjectRequestDto'

/** Business operations for construction projects. */
export interface IProjectService {
  getAllAsync(actorUserId: number, page: number, pageSize: number): Promise<PaginatedResult<ProjectResponseDto>>
  getByIdAsync(actorUserId: number, id: number): Promise<ProjectResponseDto | null>
  getSummaryAsync(actorUserId: number, id: number): Promise<ProjectSummaryDto | null>
  createAsync(actorUserId: number, dto: CreateProjectRequestDto): Promise<ProjectResponseDto>

  /**
   * Updates project details. Returns dto null if not found.
   * Returns an error string if the Status value is invalid.
   */
  updateAsync(
    actorUserId: number,
    id: number,
    dto: UpdateProjectRequestDto,
  ): Promise<{ dto: ProjectResponseDto | null; error: string | null }>

  createCostCodeAsync(actorUserId: number, projectId: number, dto: CreateCostCodeRequestDto): Promise<CostCodeResponseDto>
  setBudgetAsync(actorUserId: number, projectId: number, dto: SetProjectBudgetRequestDto): Promise<ProjectBudgetResponseDto>
  addProgressVerificationAsync(
    actorUserId: number,
    projectId: number,
    dto: CreateProjectProgressVerificationRequestDto,
  ): Promise<ProjectProgressVerificationResponseDto>
}
