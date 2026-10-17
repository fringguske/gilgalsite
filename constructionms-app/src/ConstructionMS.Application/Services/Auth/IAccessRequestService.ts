import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  AccessRequestResponseDto, ApproveAccessRequestDto, RegisterAccessRequestDto, RejectAccessRequestDto,
} from '@/ConstructionMS.Application/DTOs/Auth/RegisterAccessRequestDto'

export interface IAccessRequestService {
  registerAsync(request: RegisterAccessRequestDto): Promise<AccessRequestResponseDto>
  getAllAsync(page: number, pageSize: number, status: string | null): Promise<PaginatedResult<AccessRequestResponseDto>>
  approveAsync(requestId: number, request: ApproveAccessRequestDto, administratorUserId: number): Promise<AccessRequestResponseDto>
  rejectAsync(requestId: number, request: RejectAccessRequestDto, administratorUserId: number): Promise<AccessRequestResponseDto>
}
