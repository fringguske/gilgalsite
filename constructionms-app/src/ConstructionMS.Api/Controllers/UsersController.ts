import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { CreateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/CreateUserRequestDto'
import { SetUserActiveRequestDto } from '@/ConstructionMS.Application/DTOs/Users/SetUserActiveRequestDto'
import { UpdateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/UpdateUserRequestDto'
import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { IUserService } from '@/ConstructionMS.Application/Services/Users/IUserService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/** Manages system users and their role assignments. */
export class UsersControllerImpl extends ControllerBase {
  constructor(private readonly userService: IUserService) { super() }

  /** Returns a paginated list of all users with their role names. */
  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const result = await this.userService.getAllAsync(page, pageSize)
    return this.ok(ApiResponse.ok(result))
  }

  /** Returns a single user by ID. PasswordHash is never included. */
  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const user = await this.userService.getByIdAsync(id)
    if (user === null) return this.notFound(ApiResponse.fail(`User with ID ${id} was not found.`))

    return this.ok(ApiResponse.ok(user))
  }

  /** Creates a new user. Supply a plain-text password; the service hashes it. */
  async create(): Promise<ActionResult> {
    const dto = await this.fromBody(CreateUserRequestDto)
    const user = await this.userService.createAsync(dto, this.currentUserId())
    return this.created(`/api/v1/users/${user.id}`, ApiResponse.ok(user))
  }

  /** Updates user profile fields. Password cannot be changed here. */
  async update(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const dto = await this.fromBody(UpdateUserRequestDto)
    const user = await this.userService.updateAsync(id, dto, this.currentUserId())
    if (user === null) return this.notFound(ApiResponse.fail(`User with ID ${id} was not found.`))

    return this.ok(ApiResponse.ok(user))
  }

  /** Activates or deactivates an account without deleting its audit identity. */
  async setActive(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SetUserActiveRequestDto)
    if (id === this.currentUserId() && !request.isActive) {
      return this.badRequest(ApiResponse.fail('Use another Administrator account to deactivate your own account.'))
    }

    const changed = await this.userService.setActiveStatusAsync(id, request.isActive, this.currentUserId())
    if (!changed) {
      return this.notFound(ApiResponse.fail(`User with ID ${id} was not found.`))
    }

    const user = await this.userService.getByIdAsync(id)
    if (user === null) {
      throw new InvalidOperationError('The user disappeared immediately after its active state was changed.')
    }
    return this.ok(ApiResponse.ok(user))
  }
}

/** [Authorize(Roles = "Administrator")] [Route("api/v1/users")] */
export const UsersController: ControllerMetadata<UsersControllerImpl> = {
  route: 'users',
  roles: ['Administrator'],
  create: services => new UsersControllerImpl(services.userService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'POST', template: '', handler: c => c.create() },
    { method: 'PUT', template: '{id:int}', handler: c => c.update() },
    { method: 'PATCH', template: '{id:int}/active', handler: c => c.setActive() },
  ],
}
