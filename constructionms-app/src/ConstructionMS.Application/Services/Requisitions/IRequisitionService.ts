import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateRequisitionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/CreateRequisitionRequestDto'
import type { RequisitionResponseDto } from '@/ConstructionMS.Application/DTOs/Requisitions/RequisitionResponseDto'
import type { UpdateRequisitionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/UpdateRequisitionRequestDto'

/** Business operations for material requisitions. */
export interface IRequisitionService {
  /**
   * Returns a paginated, optionally filtered list of requisitions.
   * `status`: optional filter "Pending", "Approved" or "Rejected".
   */
  getAllAsync(
    page: number,
    pageSize: number,
    status?: string | null,
    projectId?: number | null,
  ): Promise<PaginatedResult<RequisitionResponseDto>>

  getByIdAsync(id: number): Promise<RequisitionResponseDto | null>

  createAsync(dto: CreateRequisitionRequestDto): Promise<RequisitionResponseDto>

  /**
   * Updates Quantity and Notes of a Pending requisition.
   * Returns an error string if the requisition is not in Pending status.
   */
  updateAsync(id: number, dto: UpdateRequisitionRequestDto): Promise<{ dto: RequisitionResponseDto | null; error: string | null }>

  /** Approves a Pending requisition. Enforces SoD (approver differs from requester). */
  approveAsync(id: number, approvedByUserId: number): Promise<{ dto: RequisitionResponseDto | null; error: string | null }>

  /** Rejects a Pending requisition. Same SoD enforcement as approveAsync. */
  rejectAsync(id: number, approvedByUserId: number): Promise<{ dto: RequisitionResponseDto | null; error: string | null }>
}
