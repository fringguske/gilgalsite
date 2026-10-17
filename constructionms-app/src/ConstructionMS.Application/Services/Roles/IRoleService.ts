import type { PaginatedResult } from '../../Common/PaginatedResult'
import type { RoleResponseDto } from '../../DTOs/Roles/RoleResponseDto'

/** Read operations for the fixed system-role reference table. */
export interface IRoleService {
  getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<RoleResponseDto>>
  getByIdAsync(id: number): Promise<RoleResponseDto | null>
}
