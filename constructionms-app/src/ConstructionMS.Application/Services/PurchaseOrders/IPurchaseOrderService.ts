import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CorrectPurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CorrectPurchaseOrderRequestDto'
import type { CreatePurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreatePurchaseOrderRequestDto'
import type { PurchaseOrderActionRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/PurchaseOrderActionRequestDto'
import type { PurchaseOrderResponseDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/PurchaseOrderResponseDto'
import type { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'

export interface IPurchaseOrderService {
  getAllAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId?: number | null,
    status?: string | null,
  ): Promise<PaginatedResult<PurchaseOrderResponseDto>>

  getByIdAsync(id: number, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto | null>

  createAsync(dto: CreatePurchaseOrderRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  submitAsync(id: number, dto: PurchaseOrderActionRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  approveAsync(id: number, dto: PurchaseOrderActionRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  issueAsync(id: number, dto: PurchaseOrderActionRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  returnToDraftAsync(id: number, dto: WorkflowReasonRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  rejectAsync(id: number, dto: WorkflowReasonRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  correctAsync(id: number, dto: CorrectPurchaseOrderRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>

  cancelAsync(id: number, dto: WorkflowReasonRequestDto, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto>
}
