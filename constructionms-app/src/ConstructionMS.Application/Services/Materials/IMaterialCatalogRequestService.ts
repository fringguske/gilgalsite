import type { PaginatedResult } from '../../Common/PaginatedResult'
import type {
  CreateMaterialCatalogRequestDto,
  MaterialCatalogRequestResponseDto,
  ReviewMaterialCatalogRequestDto,
} from '../../DTOs/Materials/MaterialCatalogRequestDtos'

export interface IMaterialCatalogRequestService {
  getAllAsync(
    page: number,
    pageSize: number,
    status: string | null,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaginatedResult<MaterialCatalogRequestResponseDto>>

  submitAsync(
    request: CreateMaterialCatalogRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialCatalogRequestResponseDto>

  reviewAsync(
    requestId: number,
    request: ReviewMaterialCatalogRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialCatalogRequestResponseDto>
}
