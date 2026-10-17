import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { CreateMaterialRequestDto } from '@/ConstructionMS.Application/DTOs/Materials/CreateMaterialRequestDto'
import { SetMaterialTechnicalAcceptancePolicyRequestDto } from '@/ConstructionMS.Application/DTOs/Materials/SetMaterialTechnicalAcceptancePolicyRequestDto'
import { UpdateMaterialRequestDto } from '@/ConstructionMS.Application/DTOs/Materials/UpdateMaterialRequestDto'
import type { IMaterialService } from '@/ConstructionMS.Application/Services/Materials/IMaterialService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/**
 * Reads and maintains the shared material catalogue used by requisitions and
 * procurement. Stock quantities are not stored in this catalogue.
 */
export class MaterialsControllerImpl extends ControllerBase {
  constructor(private readonly materialService: IMaterialService) { super() }

  /** Returns material choices for authenticated workflow users. */
  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const result = await this.materialService.getAllAsync(page, pageSize)
    return this.ok(ApiResponse.ok(result))
  }

  /** Returns one material catalogue record. */
  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const material = await this.materialService.getByIdAsync(id)
    if (material === null) {
      return this.notFound(ApiResponse.fail(`Material with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(material))
  }

  /** Adds a material to the shared catalogue. */
  async create(): Promise<ActionResult> {
    const request = await this.fromBody(CreateMaterialRequestDto)
    const material = await this.materialService.createAsync(request)
    return this.created(`/api/v1/materials/${material.id}`, ApiResponse.ok(material))
  }

  /** Updates material catalogue metadata and reference pricing. */
  async update(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(UpdateMaterialRequestDto)
    const material = await this.materialService.updateAsync(id, request)
    if (material === null) {
      return this.notFound(ApiResponse.fail(`Material with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(material))
  }

  /** Changes the engineering acceptance rule for future purchase orders. */
  async setTechnicalAcceptancePolicy(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SetMaterialTechnicalAcceptancePolicyRequestDto)
    const material = await this.materialService.setTechnicalAcceptancePolicyAsync(
      id, request.required!, this.currentUserId())
    if (material === null) {
      return this.notFound(ApiResponse.fail(`Material with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(material))
  }
}

/** [Authorize] [Route("api/v1/materials")] */
export const MaterialsController: ControllerMetadata<MaterialsControllerImpl> = {
  route: 'materials',
  create: services => new MaterialsControllerImpl(services.materialService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'POST', template: '', roles: ['CEO', 'Procurement Officer'], handler: c => c.create() },
    { method: 'PUT', template: '{id:int}', roles: ['CEO', 'Procurement Officer'], handler: c => c.update() },
    { method: 'PATCH', template: '{id:int}/technical-acceptance-policy', roles: ['CEO'], handler: c => c.setTechnicalAcceptancePolicy() },
  ],
}
