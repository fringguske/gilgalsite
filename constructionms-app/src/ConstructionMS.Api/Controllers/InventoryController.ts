import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import {
  ConfirmMaterialIssueRequestDto,
  CreateStockCountRequestDto,
  CreateStockTransferRequestDto,
  IssueMaterialRequestDto,
  ReceiveGoodsRequestDto,
  ReceiveStockTransferRequestDto,
  RecordMaterialUsageRequestDto,
  RecordTechnicalAcceptanceRequestDto,
  ResolveStockTransferDisputeRequestDto,
  ReviewStockCountRequestDto,
} from '@/ConstructionMS.Application/DTOs/Inventory/InventoryDtos'
import type { IInventoryWorkflowService } from '@/ConstructionMS.Application/Services/Inventory/IInventoryWorkflowService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class InventoryControllerImpl extends ControllerBase {
  constructor(private readonly inventory: IInventoryWorkflowService) { super() }

  private page(): number {
    return this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
  }

  private pageSize(): number {
    return this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
  }

  async getReceipts(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(
      await this.inventory.getReceiptsAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId)))
  }

  async receive(): Promise<ActionResult> {
    const request = await this.fromBody(ReceiveGoodsRequestDto)
    const result = await this.inventory.receiveGoodsAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/inventory/receipts/${result.id}`, ApiResponse.ok(result))
  }

  async getTechnicalAcceptances(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const status = this.queryString('status')
    return this.ok(ApiResponse.ok(
      await this.inventory.getTechnicalAcceptancesAsync(
        page, pageSize, this.currentUserId(), this.currentRole(), projectId, status)))
  }

  async recordTechnicalAcceptance(): Promise<ActionResult> {
    const receiptId = this.routeInt('receiptId')
    const request = await this.fromBody(RecordTechnicalAcceptanceRequestDto)
    return this.ok(ApiResponse.ok(
      await this.inventory.recordTechnicalAcceptanceAsync(receiptId, request, this.currentUserId(), this.currentRole())))
  }

  async getBalances(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(
      await this.inventory.getBalancesAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId)))
  }

  async getLedger(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    const materialId = this.queryInt('materialId', { defaultValue: null })
    return this.ok(ApiResponse.ok(
      await this.inventory.getLedgerAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId, materialId)))
  }

  async getIssues(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(
      await this.inventory.getIssuesAsync(page, pageSize, this.currentUserId(), this.currentRole(), projectId)))
  }

  async issue(): Promise<ActionResult> {
    const request = await this.fromBody(IssueMaterialRequestDto)
    const result = await this.inventory.issueMaterialAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/inventory/issues/${result.id}`, ApiResponse.ok(result))
  }

  async confirm(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ConfirmMaterialIssueRequestDto)
    return this.ok(ApiResponse.ok(await this.inventory.confirmIssueAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async recordUsage(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(RecordMaterialUsageRequestDto)
    return this.ok(ApiResponse.ok(await this.inventory.recordUsageAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async getTransfers(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    return this.ok(ApiResponse.ok(
      await this.inventory.getTransfersAsync(page, pageSize, this.currentUserId(), this.currentRole())))
  }

  async createTransfer(): Promise<ActionResult> {
    const request = await this.fromBody(CreateStockTransferRequestDto)
    const result = await this.inventory.createTransferAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/inventory/transfers/${result.id}`, ApiResponse.ok(result))
  }

  async dispatchTransfer(): Promise<ActionResult> {
    const id = this.routeInt('id')
    return this.ok(ApiResponse.ok(await this.inventory.dispatchTransferAsync(id, this.currentUserId(), this.currentRole())))
  }

  async receiveTransfer(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReceiveStockTransferRequestDto)
    return this.ok(ApiResponse.ok(await this.inventory.receiveTransferAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async resolveTransferDispute(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ResolveStockTransferDisputeRequestDto)
    return this.ok(ApiResponse.ok(
      await this.inventory.resolveTransferDisputeAsync(id, request, this.currentUserId(), this.currentRole())))
  }

  async getCounts(): Promise<ActionResult> {
    const page = this.page()
    const pageSize = this.pageSize()
    return this.ok(ApiResponse.ok(
      await this.inventory.getCountsAsync(page, pageSize, this.currentUserId(), this.currentRole())))
  }

  async createCount(): Promise<ActionResult> {
    const request = await this.fromBody(CreateStockCountRequestDto)
    const result = await this.inventory.createCountAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/inventory/counts/${result.id}`, ApiResponse.ok(result))
  }

  async reviewCount(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewStockCountRequestDto)
    return this.ok(ApiResponse.ok(await this.inventory.reviewCountAsync(id, request, this.currentUserId(), this.currentRole())))
  }
}

/** [Route("api/v1/inventory")] */
export const InventoryController: ControllerMetadata<InventoryControllerImpl> = {
  route: 'inventory',
  create: services => new InventoryControllerImpl(services.inventoryWorkflowService),
  roles: ['Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Procurement Officer', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: 'receipts', roles: ['Storekeeper', 'Procurement Officer', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getReceipts() },
    { method: 'POST', template: 'receipts', roles: ['Storekeeper'], handler: c => c.receive() },
    { method: 'GET', template: 'technical-acceptances', roles: ['Engineer', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getTechnicalAcceptances() },
    { method: 'POST', template: 'receipts/{receiptId:long}/technical-acceptance', roles: ['Engineer'], handler: c => c.recordTechnicalAcceptance() },
    { method: 'GET', template: 'balances', roles: ['Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getBalances() },
    { method: 'GET', template: 'ledger', roles: ['Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getLedger() },
    { method: 'GET', template: 'issues', roles: ['Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Finance Officer', 'CEO', 'Auditor'], handler: c => c.getIssues() },
    { method: 'POST', template: 'issues', roles: ['Storekeeper'], handler: c => c.issue() },
    { method: 'POST', template: 'issues/{id:long}/confirm', roles: ['Foreman'], handler: c => c.confirm() },
    { method: 'POST', template: 'issues/{id:long}/usage', roles: ['Foreman'], handler: c => c.recordUsage() },
    { method: 'GET', template: 'transfers', roles: ['Storekeeper', 'Supervisor', 'CEO', 'Auditor'], handler: c => c.getTransfers() },
    { method: 'POST', template: 'transfers', roles: ['Supervisor'], handler: c => c.createTransfer() },
    { method: 'POST', template: 'transfers/{id:long}/dispatch', roles: ['Storekeeper'], handler: c => c.dispatchTransfer() },
    { method: 'POST', template: 'transfers/{id:long}/receive', roles: ['Storekeeper'], handler: c => c.receiveTransfer() },
    { method: 'POST', template: 'transfers/{id:long}/resolve', roles: ['CEO'], handler: c => c.resolveTransferDispute() },
    { method: 'GET', template: 'counts', roles: ['Storekeeper', 'Supervisor', 'CEO', 'Auditor'], handler: c => c.getCounts() },
    { method: 'POST', template: 'counts', roles: ['Storekeeper'], handler: c => c.createCount() },
    { method: 'POST', template: 'counts/{id:long}/review', roles: ['Supervisor'], handler: c => c.reviewCount() },
  ],
}
