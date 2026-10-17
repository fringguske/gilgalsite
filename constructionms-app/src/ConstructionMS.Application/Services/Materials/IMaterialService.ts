import type { PaginatedResult } from '../../Common/PaginatedResult'
import type { CreateMaterialRequestDto } from '../../DTOs/Materials/CreateMaterialRequestDto'
import type { MaterialResponseDto } from '../../DTOs/Materials/MaterialResponseDto'
import type { UpdateMaterialRequestDto } from '../../DTOs/Materials/UpdateMaterialRequestDto'

/** Business operations for the material catalogue. */
export interface IMaterialService {
  getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<MaterialResponseDto>>
  getByIdAsync(id: number): Promise<MaterialResponseDto | null>
  createAsync(dto: CreateMaterialRequestDto): Promise<MaterialResponseDto>
  updateAsync(id: number, dto: UpdateMaterialRequestDto): Promise<MaterialResponseDto | null>
  setTechnicalAcceptancePolicyAsync(id: number, required: boolean, actorUserId: number): Promise<MaterialResponseDto | null>
}
