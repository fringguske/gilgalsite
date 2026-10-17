import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import {
  ConfirmPettyCashReceiptDto,
  CreatePettyCashRequestDto,
  DecidePettyCashRequestDto,
  DisbursePettyCashRequestDto,
  ReviewPettyCashReconciliationDto,
  SubmitPettyCashReconciliationDto,
} from '@/ConstructionMS.Application/DTOs/Finance/PettyCashDtos'
import type { IPettyCashService } from '@/ConstructionMS.Application/Services/Finance/IPettyCashService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class PettyCashControllerImpl extends ControllerBase {
  constructor(private readonly pettyCash: IPettyCashService) { super() }

  async get(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const status = this.queryString('status')
    return this.ok(ApiResponse.ok(
      await this.pettyCash.getRequestsAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId, status)))
  }

  async create(): Promise<ActionResult> {
    const request = await this.fromBody(CreatePettyCashRequestDto)
    const result = await this.pettyCash.createRequestAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/finance/petty-cash/${result.id}`, ApiResponse.ok(result))
  }

  async decide(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(DecidePettyCashRequestDto)
    return this.ok(ApiResponse.ok(await this.pettyCash.decideRequestAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async disburse(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(DisbursePettyCashRequestDto)
    return this.ok(ApiResponse.ok(await this.pettyCash.disburseAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async confirmReceipt(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ConfirmPettyCashReceiptDto)
    return this.ok(ApiResponse.ok(await this.pettyCash.confirmReceiptAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async reconcile(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SubmitPettyCashReconciliationDto)
    return this.ok(ApiResponse.ok(await this.pettyCash.submitReconciliationAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async reviewReconciliation(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewPettyCashReconciliationDto)
    return this.ok(ApiResponse.ok(await this.pettyCash.reviewReconciliationAsync(id, request, this.currentUserId(), this.currentRole())))
  }
}

/** [Route("api/v1/finance/petty-cash")] */
export const PettyCashController: ControllerMetadata<PettyCashControllerImpl> = {
  route: 'finance/petty-cash',
  create: services => new PettyCashControllerImpl(services.pettyCashService),
  roles: ['Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '', handler: c => c.get() },
    { method: 'POST', template: '', roles: ['Supervisor'], handler: c => c.create() },
    { method: 'POST', template: '{id:long}/decision', roles: ['Finance Officer'], handler: c => c.decide() },
    { method: 'POST', template: '{id:long}/disburse', roles: ['Finance Officer'], handler: c => c.disburse() },
    { method: 'POST', template: '{id:long}/receipt-confirmation', roles: ['Supervisor'], handler: c => c.confirmReceipt() },
    { method: 'POST', template: '{id:long}/reconciliation', roles: ['Supervisor'], handler: c => c.reconcile() },
    { method: 'POST', template: '{id:long}/reconciliation-decision', roles: ['Finance Officer'], handler: c => c.reviewReconciliation() },
  ],
}
