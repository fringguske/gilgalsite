import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { CreateSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreateSourcingRoundRequestDto'
import { RecordSupplierQuoteRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/RecordSupplierQuoteRequestDto'
import { ReopenSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/ReopenSourcingRoundRequestDto'
import { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'
import type { ISourcingService } from '@/ConstructionMS.Application/Services/PurchaseOrders/ISourcingService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/** Captures supplier quotations for approved requisitions before a PO is prepared. */
export class SourcingRoundsControllerImpl extends ControllerBase {
  constructor(private readonly sourcingService: ISourcingService) { super() }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const status = this.queryString('status')
    const result = await this.sourcingService.getAllAsync(
      page, pageSize, this.currentUserId(), this.currentRole(), projectId, status)
    return this.ok(ApiResponse.ok(result))
  }

  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const result = await this.sourcingService.getByIdAsync(id, this.currentUserId(), this.currentRole())
    if (result === null) {
      return this.notFound(ApiResponse.fail(`Sourcing round with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(result))
  }

  async create(): Promise<ActionResult> {
    const dto = await this.fromBody(CreateSourcingRoundRequestDto)
    const result = await this.sourcingService.createAsync(dto, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/sourcing-rounds/${result.id}`, ApiResponse.ok(result))
  }

  async recordQuote(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(RecordSupplierQuoteRequestDto)
    const result = await this.sourcingService.recordQuoteAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.statusCode(201, ApiResponse.ok(result))
  }

  async close(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(WorkflowReasonRequestDto)
    const result = await this.sourcingService.closeAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async cancel(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(WorkflowReasonRequestDto)
    const result = await this.sourcingService.cancelAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async reopen(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(ReopenSourcingRoundRequestDto)
    const result = await this.sourcingService.reopenAsync(id, dto, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }
}

/** [Authorize(Roles = "Procurement Officer,Supervisor,CEO,Auditor")] [Route("api/v1/sourcing-rounds")] */
export const SourcingRoundsController: ControllerMetadata<SourcingRoundsControllerImpl> = {
  route: 'sourcing-rounds',
  create: services => new SourcingRoundsControllerImpl(services.sourcingService),
  roles: ['Procurement Officer', 'Supervisor', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'POST', template: '', roles: ['Procurement Officer'], handler: c => c.create() },
    { method: 'POST', template: '{id:int}/quotes', roles: ['Procurement Officer'], handler: c => c.recordQuote() },
    { method: 'POST', template: '{id:int}/close', roles: ['Procurement Officer'], handler: c => c.close() },
    { method: 'POST', template: '{id:int}/cancel', roles: ['Supervisor', 'CEO'], handler: c => c.cancel() },
    { method: 'POST', template: '{id:int}/reopen', roles: ['Procurement Officer', 'Supervisor', 'CEO'], handler: c => c.reopen() },
  ],
}
