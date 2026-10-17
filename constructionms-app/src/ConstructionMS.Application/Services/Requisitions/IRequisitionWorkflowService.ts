import type { OperationResult } from '@/ConstructionMS.Application/Common/OperationResult'
import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateRequisitionV1RequestDto'
import type { CreateStockReplenishmentRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateStockReplenishmentRequestDto'
import type { RequisitionWorkflowResponseDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/RequisitionWorkflowResponseDto'
import type { SupervisorDecisionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/SupervisorDecisionRequestDto'
import type { TechnicalCheckRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/TechnicalCheckRequestDto'
import type { UpdateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/UpdateRequisitionV1RequestDto'

/** Authenticated v1 requisition workflow. */
export interface IRequisitionWorkflowService {
  getAllAsync(
    actorUserId: number,
    page: number,
    pageSize: number,
    status: string | null,
    projectId: number | null,
  ): Promise<OperationResult<PaginatedResult<RequisitionWorkflowResponseDto>>>

  getByIdAsync(actorUserId: number, requisitionId: number): Promise<OperationResult<RequisitionWorkflowResponseDto>>

  createAsync(actorUserId: number, request: CreateRequisitionV1RequestDto): Promise<OperationResult<RequisitionWorkflowResponseDto>>

  createStockReplenishmentAsync(
    actorUserId: number,
    request: CreateStockReplenishmentRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>>

  updateAsync(
    actorUserId: number,
    requisitionId: number,
    request: UpdateRequisitionV1RequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>>

  recordTechnicalCheckAsync(
    actorUserId: number,
    requisitionId: number,
    request: TechnicalCheckRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>>

  recordSupervisorDecisionAsync(
    actorUserId: number,
    requisitionId: number,
    request: SupervisorDecisionRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>>
}
