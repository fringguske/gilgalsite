import { UpdateProjectAssignmentsRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/UpdateProjectAssignmentsRequestDto'
import type { IUserProjectAssignmentService } from '@/ConstructionMS.Application/Services/Auth/IUserProjectAssignmentService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class UserProjectAssignmentsControllerImpl extends ControllerBase {
  constructor(private readonly assignmentService: IUserProjectAssignmentService) { super() }

  async get(): Promise<ActionResult> {
    const userId = this.routeInt('userId')
    const assignments = await this.assignmentService.getAssignmentsAsync(userId)
    return this.ok(ApiResponse.ok(assignments))
  }

  async replace(): Promise<ActionResult> {
    const userId = this.routeInt('userId')
    const request = await this.fromBody(UpdateProjectAssignmentsRequestDto)
    const assignments = await this.assignmentService.replaceAssignmentsAsync(
      userId,
      request.projectIds,
      this.currentUserId())
    return this.ok(ApiResponse.ok(assignments))
  }
}

/** [Authorize(Roles = "Administrator")] [Route("api/v1/users/{userId:int}/projects")] */
export const UserProjectAssignmentsController: ControllerMetadata<UserProjectAssignmentsControllerImpl> = {
  route: 'users/{userId:int}/projects',
  roles: ['Administrator'],
  create: services => new UserProjectAssignmentsControllerImpl(services.userProjectAssignmentService),
  actions: [
    { method: 'GET', template: '', handler: c => c.get() },
    { method: 'PUT', template: '', handler: c => c.replace() },
  ],
}
