import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'
import type { IMyTasksService } from '@/ConstructionMS.Application/Services/Tasks/IMyTasksService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class MyTasksControllerImpl extends ControllerBase {
  constructor(private readonly tasks: IMyTasksService) { super() }

  async get(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null, range: [1, INT_MAX] })
    const overdueOnly = this.queryBool('overdueOnly', false)
    return this.ok(ApiResponse.ok(
      await this.tasks.getMyTasksAsync(this.currentUserId(), this.currentRole(), projectId, overdueOnly)))
  }
}

/** [Authorize] [Route("api/v1/my-tasks")] */
export const MyTasksController: ControllerMetadata<MyTasksControllerImpl> = {
  route: 'my-tasks',
  create: services => new MyTasksControllerImpl(services.myTasksService),
  actions: [
    { method: 'GET', template: '', handler: c => c.get() },
  ],
}
