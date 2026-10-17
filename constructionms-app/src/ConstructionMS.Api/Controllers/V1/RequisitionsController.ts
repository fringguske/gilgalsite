import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { CreateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateRequisitionV1RequestDto'
import { CreateStockReplenishmentRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateStockReplenishmentRequestDto'
import { SupervisorDecisionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/SupervisorDecisionRequestDto'
import { TechnicalCheckRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/TechnicalCheckRequestDto'
import { UpdateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/UpdateRequisitionV1RequestDto'
import type { IRequisitionWorkflowService } from '@/ConstructionMS.Application/Services/Requisitions/IRequisitionWorkflowService'
import { ApiResponse } from '../../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../../Common/ControllerBase'

/** Authenticated Foreman -> Engineer -> Supervisor material-request workflow. */
export class RequisitionsControllerImpl extends ControllerBase {
  constructor(private readonly workflow: IRequisitionWorkflowService) { super() }

  /** Returns only requisitions visible to the authenticated user's role and projects. */
  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const status = this.queryString('status', { stringLength: [50] })
    const projectId = this.queryInt('projectId', { defaultValue: null, range: [1, INT_MAX] })
    const result = await this.workflow.getAllAsync(this.currentUserId(), page, pageSize, status, projectId)
    return this.toActionResult(result)
  }

  /** Returns one role- and project-scoped requisition. */
  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const result = await this.workflow.getByIdAsync(this.currentUserId(), id)
    return this.toActionResult(result)
  }

  /** Creates a request as the authenticated foreman. */
  async create(): Promise<ActionResult> {
    const request = await this.fromBody(CreateRequisitionV1RequestDto)
    const result = await this.workflow.createAsync(this.currentUserId(), request)
    if (!result.succeeded) {
      return this.toActionResult(result)
    }

    return this.created(`/api/v1/requisitions/${result.value!.id}`, ApiResponse.ok(result.value!))
  }

  /**
   * Creates a bulk store-replenishment request. It requires Supervisor approval,
   * enters Procurement sourcing, and is never eligible for a foreman issue voucher.
   */
  async createStockReplenishment(): Promise<ActionResult> {
    const request = await this.fromBody(CreateStockReplenishmentRequestDto)
    const result = await this.workflow.createStockReplenishmentAsync(this.currentUserId(), request)
    if (!result.succeeded) {
      return this.toActionResult(result)
    }

    return this.created(`/api/v1/requisitions/${result.value!.id}`, ApiResponse.ok(result.value!))
  }

  /**
   * Revises a request as its original foreman. ExpectedRevision protects a newer
   * engineer or supervisor action from being overwritten.
   */
  async update(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(UpdateRequisitionV1RequestDto)
    const result = await this.workflow.updateAsync(this.currentUserId(), id, request)
    return this.toActionResult(result)
  }

  /** Records the authenticated assigned engineer's technical check. */
  async technicalCheck(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(TechnicalCheckRequestDto)
    const result = await this.workflow.recordTechnicalCheckAsync(this.currentUserId(), id, request)
    return this.toActionResult(result)
  }

  /** Records the authenticated assigned supervisor's independent decision. */
  async decide(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SupervisorDecisionRequestDto)
    const result = await this.workflow.recordSupervisorDecisionAsync(this.currentUserId(), id, request)
    return this.toActionResult(result)
  }
}

/** [Authorize] [Route("api/v1/requisitions")] */
export const RequisitionsController: ControllerMetadata<RequisitionsControllerImpl> = {
  route: 'requisitions',
  create: services => new RequisitionsControllerImpl(services.requisitionWorkflowService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'POST', template: '', handler: c => c.create() },
    { method: 'POST', template: 'stock-replenishment', roles: ['Storekeeper'], handler: c => c.createStockReplenishment() },
    { method: 'PATCH', template: '{id:int}', handler: c => c.update() },
    { method: 'POST', template: '{id:int}/technical-check', handler: c => c.technicalCheck() },
    { method: 'POST', template: '{id:int}/decision', handler: c => c.decide() },
  ],
}
