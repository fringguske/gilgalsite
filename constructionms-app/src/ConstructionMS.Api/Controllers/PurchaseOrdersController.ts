import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import type { DtoSchema } from '@/ConstructionMS.Application/Common/Validation'
import { CorrectPurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CorrectPurchaseOrderRequestDto'
import { CreatePurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreatePurchaseOrderRequestDto'
import { PurchaseOrderActionRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/PurchaseOrderActionRequestDto'
import { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'
import type { IPurchaseOrderService } from '@/ConstructionMS.Application/Services/PurchaseOrders/IPurchaseOrderService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/** Prepares, independently approves and issues supplier purchase orders. */
export class PurchaseOrdersControllerImpl extends ControllerBase {
  constructor(private readonly purchaseOrderService: IPurchaseOrderService) { super() }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const status = this.queryString('status')
    const result = await this.purchaseOrderService.getAllAsync(
      page, pageSize, this.currentUserId(), this.currentRole(), projectId, status)
    return this.ok(ApiResponse.ok(result))
  }

  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const result = await this.purchaseOrderService.getByIdAsync(id, this.currentUserId(), this.currentRole())
    if (result === null) {
      return this.notFound(ApiResponse.fail(`Purchase order with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(result))
  }

  async create(): Promise<ActionResult> {
    const dto = await this.fromBody(CreatePurchaseOrderRequestDto)
    const result = await this.purchaseOrderService.createAsync(dto, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/purchase-orders/${result.id}`, ApiResponse.ok(result))
  }

  /** `[FromBody] PurchaseOrderActionRequestDto?` — an empty body binds to a default instance. */
  private async optionalActionBody(): Promise<PurchaseOrderActionRequestDto> {
    let raw: unknown
    try {
      raw = await this.httpContext.readJsonAsync()
    } catch {
      // Malformed JSON: reproduce the binder's 400 response.
      return this.fromBody(PurchaseOrderActionRequestDto)
    }

    if (raw === undefined || raw === null) {
      return { notes: null }
    }

    return (PurchaseOrderActionRequestDto as DtoSchema<PurchaseOrderActionRequestDto>).bind(raw)
  }

  async submit(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.optionalActionBody()
    const result = await this.purchaseOrderService.submitAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async approve(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.optionalActionBody()
    const result = await this.purchaseOrderService.approveAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async issue(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.optionalActionBody()
    const result = await this.purchaseOrderService.issueAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async returnToDraft(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(WorkflowReasonRequestDto)
    const result = await this.purchaseOrderService.returnToDraftAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async reject(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(WorkflowReasonRequestDto)
    const result = await this.purchaseOrderService.rejectAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async correct(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(CorrectPurchaseOrderRequestDto)
    const result = await this.purchaseOrderService.correctAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async cancel(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(WorkflowReasonRequestDto)
    const result = await this.purchaseOrderService.cancelAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }
}

/** [Authorize(Roles = "...")] [Route("api/v1/purchase-orders")] */
export const PurchaseOrdersController: ControllerMetadata<PurchaseOrdersControllerImpl> = {
  route: 'purchase-orders',
  create: services => new PurchaseOrdersControllerImpl(services.purchaseOrderService),
  roles: ['Procurement Officer', 'Supervisor', 'Storekeeper', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'POST', template: '', roles: ['Procurement Officer'], handler: c => c.create() },
    { method: 'POST', template: '{id:int}/submit', roles: ['Procurement Officer'], handler: c => c.submit() },
    { method: 'POST', template: '{id:int}/approve', roles: ['Supervisor', 'CEO'], handler: c => c.approve() },
    { method: 'POST', template: '{id:int}/issue', roles: ['Procurement Officer'], handler: c => c.issue() },
    { method: 'POST', template: '{id:int}/return-to-draft', roles: ['Supervisor', 'CEO'], handler: c => c.returnToDraft() },
    { method: 'POST', template: '{id:int}/reject', roles: ['Supervisor', 'CEO'], handler: c => c.reject() },
    { method: 'PATCH', template: '{id:int}/correction', roles: ['Procurement Officer'], handler: c => c.correct() },
    { method: 'POST', template: '{id:int}/cancel', roles: ['Procurement Officer', 'Supervisor', 'CEO'], handler: c => c.cancel() },
  ],
}
