import { Pagination, INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'
import type { IRoleService } from '@/ConstructionMS.Application/Services/Roles/IRoleService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/**
 * Reads the fixed construction-system roles. Role definitions are not mutable
 * through the API because they form part of the authorization model.
 */
export class RolesControllerImpl extends ControllerBase {
  constructor(private readonly roleService: IRoleService) { super() }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const result = await this.roleService.getAllAsync(page, pageSize)
    return this.ok(ApiResponse.ok(result))
  }

  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const role = await this.roleService.getByIdAsync(id)
    if (role === null) return this.notFound(ApiResponse.fail(`Role with ID ${id} was not found.`))
    return this.ok(ApiResponse.ok(role))
  }
}

/** [Route("api/v1/roles")] [Authorize]; `route` is relative to /api/v1. */
export const RolesController: ControllerMetadata<RolesControllerImpl> = {
  route: 'roles',
  create: services => new RolesControllerImpl(services.roleService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
  ],
}
