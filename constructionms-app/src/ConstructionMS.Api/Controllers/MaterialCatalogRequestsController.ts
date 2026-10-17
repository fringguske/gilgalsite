import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import {
  CreateMaterialCatalogRequestDto,
  ReviewMaterialCatalogRequestDto,
} from '@/ConstructionMS.Application/DTOs/Materials/MaterialCatalogRequestDtos'
import type { IMaterialCatalogRequestService } from '@/ConstructionMS.Application/Services/Materials/IMaterialCatalogRequestService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class MaterialCatalogRequestsControllerImpl extends ControllerBase {
  constructor(private readonly materialCatalogRequests: IMaterialCatalogRequestService) { super() }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const status = this.queryString('status', { stringLength: [20] })
    const result = await this.materialCatalogRequests.getAllAsync(
      page, pageSize, status, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }

  async submit(): Promise<ActionResult> {
    const request = await this.fromBody(CreateMaterialCatalogRequestDto)
    const result = await this.materialCatalogRequests.submitAsync(request, this.currentUserId(), this.currentRole())
    return this.statusCode(201, ApiResponse.ok(result))
  }

  async review(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewMaterialCatalogRequestDto)
    const result = await this.materialCatalogRequests.reviewAsync(id, request, this.currentUserId(), this.currentRole())
    return this.ok(ApiResponse.ok(result))
  }
}

/** [Authorize(Roles = "Foreman,Procurement Officer,CEO,Auditor")] [Route("api/v1/material-catalog-requests")] */
export const MaterialCatalogRequestsController: ControllerMetadata<MaterialCatalogRequestsControllerImpl> = {
  route: 'material-catalog-requests',
  create: services => new MaterialCatalogRequestsControllerImpl(services.materialCatalogRequestService),
  roles: ['Foreman', 'Procurement Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'POST', template: '', roles: ['Foreman'], handler: c => c.submit() },
    { method: 'POST', template: '{id:int}/decision', roles: ['Procurement Officer'], handler: c => c.review() },
  ],
}
