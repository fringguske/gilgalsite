import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { ModelValidationError } from '@/ConstructionMS.Application/Common/Validation'
import {
  AuthorizePaymentRequestDto,
  CeoInvoiceDecisionRequestDto,
  CreateSupplierInvoiceRequestDto,
  ExecutePaymentRequestDto,
  ReviewInvoiceRequestDto,
} from '@/ConstructionMS.Application/DTOs/Finance/FinanceDtos'
import type { IFinanceWorkflowService } from '@/ConstructionMS.Application/Services/Finance/IFinanceWorkflowService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

const ChainKeyPattern = /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/

export class FinanceControllerImpl extends ControllerBase {
  constructor(private readonly finance: IFinanceWorkflowService) { super() }

  private page(): number {
    return this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
  }

  private pageSize(): number {
    return this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
  }

  async getInvoices(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const status = this.queryString('status')
    return this.ok(ApiResponse.ok(
      await this.finance.getInvoicesAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId, status)))
  }

  async createInvoice(): Promise<ActionResult> {
    const request = await this.fromBody(CreateSupplierInvoiceRequestDto)
    const result = await this.finance.createInvoiceAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/finance/invoices/${result.id}`, ApiResponse.ok(result))
  }

  async reviewInvoice(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewInvoiceRequestDto)
    return this.ok(ApiResponse.ok(await this.finance.reviewInvoiceAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async ceoDecision(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(CeoInvoiceDecisionRequestDto)
    return this.ok(ApiResponse.ok(await this.finance.recordCeoDecisionAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async authorize(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(AuthorizePaymentRequestDto)
    return this.ok(ApiResponse.ok(await this.finance.authorizePaymentAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async getAuthorizations(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const unpaidOnly = this.queryBool('unpaidOnly', false)
    return this.ok(ApiResponse.ok(
      await this.finance.getAuthorizationsAsync(page, pageSize, this.currentUserId(), this.currentRole(), unpaidOnly)))
  }

  async pay(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ExecutePaymentRequestDto)
    return this.ok(ApiResponse.ok(await this.finance.executePaymentAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async getPayments(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    return this.ok(ApiResponse.ok(
      await this.finance.getPaymentsAsync(page, pageSize, this.currentUserId(), this.currentRole())))
  }

  async getCashBook(): Promise<ActionResult> {
    return this.ok(ApiResponse.ok(await this.finance.getCashBookAsync(this.currentUserId(), this.currentRole())))
  }

  async getControlEvents(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null, range: [1, INT_MAX] })
    const requisitionId = this.queryInt('requisitionId', { defaultValue: null, range: [1, INT_MAX] })
    const chainKey = this.queryString('chainKey')
    if (chainKey !== null) {
      const messages: string[] = []
      if (chainKey.length > 80 || chainKey.length < 3) {
        messages.push('The field chainKey must be a string with a minimum length of 3 and a maximum length of 80.')
      }
      if (!ChainKeyPattern.test(chainKey)) {
        messages.push('Chain key must use the format PREFIX-ID, for example REQ-42 or TRF-7.')
      }
      if (messages.length > 0) throw new ModelValidationError({ chainKey: messages })
    }

    return this.ok(ApiResponse.ok(
      await this.finance.getControlEventsAsync(
        page, pageSize, this.currentUserId(), this.currentRole(), projectId, requisitionId, chainKey)))
  }
}

/** [Route("api/v1/finance")] */
export const FinanceController: ControllerMetadata<FinanceControllerImpl> = {
  route: 'finance',
  create: services => new FinanceControllerImpl(services.financeWorkflowService),
  roles: ['Procurement Officer', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: 'invoices', handler: c => c.getInvoices() },
    { method: 'POST', template: 'invoices', roles: ['Procurement Officer'], handler: c => c.createInvoice() },
    { method: 'POST', template: 'invoices/{id:long}/review', roles: ['Finance Officer'], handler: c => c.reviewInvoice() },
    { method: 'POST', template: 'invoices/{id:long}/ceo-decision', roles: ['CEO'], handler: c => c.ceoDecision() },
    { method: 'POST', template: 'invoices/{id:long}/authorize', roles: ['Supervisor'], handler: c => c.authorize() },
    { method: 'GET', template: 'authorizations', roles: ['Supervisor', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getAuthorizations() },
    { method: 'POST', template: 'authorizations/{id:long}/pay', roles: ['Finance Officer'], handler: c => c.pay() },
    { method: 'GET', template: 'payments', roles: ['Supervisor', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getPayments() },
    { method: 'GET', template: 'cash-book', roles: ['CEO', 'Auditor', 'Finance Officer'], handler: c => c.getCashBook() },
    { method: 'GET', template: 'control-events', roles: ['CEO', 'Auditor'], handler: c => c.getControlEvents() },
  ],
}
