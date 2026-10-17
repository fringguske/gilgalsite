import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import { SetSupplierBlacklistRequestDto } from '@/ConstructionMS.Application/DTOs/Suppliers/SetSupplierBlacklistRequestDto'
import type { SupplierResponseDto } from '@/ConstructionMS.Application/DTOs/Suppliers/SupplierResponseDto'
import type { SupplierSummaryResponseDto } from '@/ConstructionMS.Application/DTOs/Suppliers/SupplierSummaryResponseDto'
import { UpdateSupplierRequestDto } from '@/ConstructionMS.Application/DTOs/Suppliers/UpdateSupplierRequestDto'
import type { ISupplierService } from '@/ConstructionMS.Application/Services/Suppliers/ISupplierService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/**
 * Maintains the supplier register used for sourcing and purchase orders.
 * Supplier financial/contact details are restricted to procurement oversight
 * roles and are omitted from collection responses.
 */
export class SuppliersControllerImpl extends ControllerBase {
  constructor(private readonly supplierService: ISupplierService) { super() }

  /** Returns supplier selection data without KRA, M-Pesa or contact details. */
  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const result = await this.supplierService.getAllAsync(page, pageSize)
    const summaries = createPaginatedResult({
      items: result.items.map(toSummary),
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
    })
    return this.ok(ApiResponse.ok(summaries))
  }

  /** Returns the complete supplier record to authorized procurement oversight roles. */
  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const supplier = await this.supplierService.getByIdAsync(id)
    if (supplier === null) {
      return this.notFound(ApiResponse.fail(`Supplier with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(supplier))
  }

  /** Updates supplier identity, tax, contact and payment metadata. */
  async update(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(UpdateSupplierRequestDto)
    const supplier = await this.supplierService.updateAsync(id, request)
    if (supplier === null) {
      return this.notFound(ApiResponse.fail(`Supplier with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(supplier))
  }

  /**
   * Explicitly blocks or reinstates a supplier. Kept CEO-only so the officer
   * who selects quotations cannot override a supplier control flag.
   */
  async setBlacklistStatus(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SetSupplierBlacklistRequestDto)
    const updated = await this.supplierService.setBlacklistStatusAsync(id, request.isBlacklisted)
    if (!updated) {
      return this.notFound(ApiResponse.fail(`Supplier with ID ${id} was not found.`))
    }

    const supplier = await this.supplierService.getByIdAsync(id)
    if (supplier === null) {
      throw new InvalidOperationError('The supplier disappeared immediately after its blacklist state was updated.')
    }

    return this.ok(ApiResponse.ok(supplier))
  }
}

function toSummary(supplier: SupplierResponseDto): SupplierSummaryResponseDto {
  return {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    isBlacklisted: supplier.isBlacklisted,
    createdAt: supplier.createdAt,
  }
}

/** [Authorize(Roles = "Procurement Officer,Finance Officer,CEO,Auditor")] [Route("api/v1/suppliers")] */
export const SuppliersController: ControllerMetadata<SuppliersControllerImpl> = {
  route: 'suppliers',
  create: services => new SuppliersControllerImpl(services.supplierService),
  roles: ['Procurement Officer', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'PUT', template: '{id:int}', roles: ['CEO'], handler: c => c.update() },
    { method: 'PATCH', template: '{id:int}/blacklist', roles: ['CEO'], handler: c => c.setBlacklistStatus() },
  ],
}
