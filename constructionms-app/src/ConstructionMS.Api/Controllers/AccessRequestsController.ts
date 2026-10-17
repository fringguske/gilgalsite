import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { ApproveAccessRequestDto, RejectAccessRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/RegisterAccessRequestDto'
import type { IAccessRequestService } from '@/ConstructionMS.Application/Services/Auth/IAccessRequestService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class AccessRequestsControllerImpl extends ControllerBase {
  constructor(private readonly accessRequests: IAccessRequestService) { super() }

  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const status = this.queryString('status', { stringLength: [20] })
    const result = await this.accessRequests.getAllAsync(page, pageSize, status)
    return this.ok(ApiResponse.ok(result))
  }

  async approve(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ApproveAccessRequestDto)
    const result = await this.accessRequests.approveAsync(id, request, this.currentUserId())
    return this.ok(ApiResponse.ok(result))
  }

  async reject(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(RejectAccessRequestDto)
    const result = await this.accessRequests.rejectAsync(id, request, this.currentUserId())
    return this.ok(ApiResponse.ok(result))
  }
}

/** [Authorize(Roles = "Administrator")] [Route("api/v1/access-requests")] */
export const AccessRequestsController: ControllerMetadata<AccessRequestsControllerImpl> = {
  route: 'access-requests',
  roles: ['Administrator'],
  create: services => new AccessRequestsControllerImpl(services.accessRequestService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'POST', template: '{id:int}/approve', handler: c => c.approve() },
    { method: 'POST', template: '{id:int}/reject', handler: c => c.reject() },
  ],
}
