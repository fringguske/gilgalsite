import { KeyNotFoundError } from '@/ConstructionMS.Application/Common/Exceptions'
import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import {
  CreateSupplierOnboardingRequestDto,
  ReviewSupplierOnboardingRequestDto,
} from '@/ConstructionMS.Application/DTOs/Suppliers/SupplierOnboardingDtos'
import type { ISupplierOnboardingService } from '@/ConstructionMS.Application/Services/Suppliers/ISupplierOnboardingService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class SupplierOnboardingControllerImpl extends ControllerBase {
  constructor(private readonly supplierOnboarding: ISupplierOnboardingService) { super() }

  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const result = await this.supplierOnboarding.getByIdAsync(id)
    if (result === null) {
      throw new KeyNotFoundError('The supplier onboarding request was not found.')
    }

    return this.ok(ApiResponse.ok(result))
  }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const status = this.queryString('status', { stringLength: [20] })
    const result = await this.supplierOnboarding.getAllAsync(page, pageSize, status)
    return this.ok(ApiResponse.ok(result))
  }

  async submit(): Promise<ActionResult> {
    const request = await this.fromBody(CreateSupplierOnboardingRequestDto)
    const result = await this.supplierOnboarding.submitAsync(request, this.currentUserId(), this.currentRole())
    return this.created(`/api/v1/supplier-onboarding/${result.id}`, ApiResponse.ok(result))
  }

  async review(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewSupplierOnboardingRequestDto)
    const result = await this.supplierOnboarding.reviewAsync(id, request, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }
}

/** [Authorize(Roles = "Procurement Officer,Finance Officer,CEO,Auditor")] [Route("api/v1/supplier-onboarding")] */
export const SupplierOnboardingController: ControllerMetadata<SupplierOnboardingControllerImpl> = {
  route: 'supplier-onboarding',
  create: services => new SupplierOnboardingControllerImpl(services.supplierOnboardingService),
  roles: ['Procurement Officer', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'POST', template: '', roles: ['Procurement Officer'], handler: c => c.submit() },
    { method: 'POST', template: '{id:int}/decision', roles: ['Finance Officer', 'CEO'], handler: c => c.review() },
  ],
}
