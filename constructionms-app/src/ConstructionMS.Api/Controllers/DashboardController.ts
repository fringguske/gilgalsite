import { toCurrentUserJson } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'
import type { IDashboardService } from '@/ConstructionMS.Application/Services/Dashboard/IDashboardService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class DashboardControllerImpl extends ControllerBase {
  constructor(private readonly dashboardService: IDashboardService) { super() }

  async get(): Promise<ActionResult> {
    const dashboard = await this.dashboardService.getAsync(this.currentUserId())
    return this.ok(ApiResponse.ok({ ...dashboard, user: toCurrentUserJson(dashboard.user) }))
  }
}

/** [Authorize] [Route("api/v1/dashboard")] */
export const DashboardController: ControllerMetadata<DashboardControllerImpl> = {
  route: 'dashboard',
  create: services => new DashboardControllerImpl(services.dashboardService),
  actions: [
    { method: 'GET', template: '', handler: c => c.get() },
  ],
}
