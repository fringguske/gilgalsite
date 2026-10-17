import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreateSourcingRoundRequestDto'
import type { RecordSupplierQuoteRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/RecordSupplierQuoteRequestDto'
import type { ReopenSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/ReopenSourcingRoundRequestDto'
import type { SourcingRoundResponseDto, SupplierQuoteResponseDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/SourcingRoundResponseDto'
import type { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'

export interface ISourcingService {
  getAllAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId?: number | null,
    status?: string | null,
  ): Promise<PaginatedResult<SourcingRoundResponseDto>>

  getByIdAsync(id: number, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto | null>

  createAsync(dto: CreateSourcingRoundRequestDto, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto>

  recordQuoteAsync(
    sourcingRoundId: number,
    dto: RecordSupplierQuoteRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierQuoteResponseDto>

  closeAsync(id: number, dto: WorkflowReasonRequestDto, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto>

  cancelAsync(id: number, dto: WorkflowReasonRequestDto, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto>

  reopenAsync(id: number, dto: ReopenSourcingRoundRequestDto, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto>
}
