import type { PaginatedResult } from '../../Common/PaginatedResult'
import type {
  CreateSupplierOnboardingRequestDto,
  ReviewSupplierOnboardingRequestDto,
  SupplierOnboardingResponseDto,
} from '../../DTOs/Suppliers/SupplierOnboardingDtos'

export interface ISupplierOnboardingService {
  getByIdAsync(requestId: number): Promise<SupplierOnboardingResponseDto | null>

  getAllAsync(
    page: number,
    pageSize: number,
    status: string | null,
  ): Promise<PaginatedResult<SupplierOnboardingResponseDto>>

  submitAsync(
    request: CreateSupplierOnboardingRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierOnboardingResponseDto>

  reviewAsync(
    requestId: number,
    request: ReviewSupplierOnboardingRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierOnboardingResponseDto>
}
