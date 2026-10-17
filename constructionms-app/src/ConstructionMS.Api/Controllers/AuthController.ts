import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import { createLogger } from '@/ConstructionMS.Application/Common/Logger'
import { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'
import { toCurrentUserJson, type CurrentUserDto } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'
import { LoginRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/LoginRequestDto'
import { RegisterAccessRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/RegisterAccessRequestDto'
import { SwitchRoleRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/SwitchRoleRequestDto'
import type { IAccessRequestService } from '@/ConstructionMS.Application/Services/Auth/IAccessRequestService'
import type { IAuthenticationService } from '@/ConstructionMS.Application/Services/Auth/IAuthenticationService'
import type { ICredentialService } from '@/ConstructionMS.Application/Services/Auth/ICredentialService'
import { ApiResponse } from '../Common/ApiResponse'
import { signIn, signOut } from '../Common/Authentication'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class AuthControllerImpl extends ControllerBase {
  constructor(
    private readonly authenticationService: IAuthenticationService,
    private readonly accessRequestService: IAccessRequestService,
    private readonly credentialService: ICredentialService,
    private readonly logger: ILogger,
  ) { super() }

  async register(): Promise<ActionResult> {
    const request = await this.fromBody(RegisterAccessRequestDto)
    const accessRequest = await this.accessRequestService.registerAsync(request)
    return this.statusCode(201, ApiResponse.ok(accessRequest))
  }

  async login(): Promise<ActionResult> {
    const request = await this.fromBody(LoginRequestDto)
    const user = await this.authenticationService.authenticateAsync(request)
    if (user === null) {
      return this.unauthorized(ApiResponse.fail('Invalid username or password.'))
    }

    await this.signInAsync(user)

    return this.ok(ApiResponse.ok(toCurrentUserJson(user)))
  }

  async me(): Promise<ActionResult> {
    const user = await this.authenticationService.getCurrentUserAsync(this.currentUserId())
    return user === null
      ? this.unauthorized(ApiResponse.fail('The authenticated user is inactive.'))
      : this.ok(ApiResponse.ok(toCurrentUserJson(user)))
  }

  /**
   * Changes only the current session's workspace role for the explicitly
   * configured IT verification account. The database role remains unchanged.
   */
  async switchRole(): Promise<ActionResult> {
    const request = await this.fromBody(SwitchRoleRequestDto)
    const userId = this.currentUserId()
    const previousRole = this.currentRole()
    const user = await this.authenticationService.getCurrentUserAsync(userId, request.role.trim())
    if (user === null || !user.canSwitchRoles) {
      return this.statusCode(403, ApiResponse.fail('Role switching is not enabled for this account.'))
    }

    await this.signInAsync(user)
    this.logger.information(
      'IT verification role context changed for user {UserId}: {PreviousRole} -> {EffectiveRole}.',
      { UserId: userId, PreviousRole: previousRole, EffectiveRole: user.role })

    return this.ok(ApiResponse.ok(toCurrentUserJson(user)))
  }

  async changeUsername(): Promise<ActionResult> {
    const request = await this.fromBody(ChangeUsernameRequestDto)
    await this.credentialService.changeUsernameAsync(this.currentUserId(), request)
    signOut(this.httpContext)
    return this.noContent()
  }

  async changePassword(): Promise<ActionResult> {
    const request = await this.fromBody(ChangePasswordRequestDto)
    await this.credentialService.changePasswordAsync(this.currentUserId(), request)
    signOut(this.httpContext)
    return this.noContent()
  }

  async logout(): Promise<ActionResult> {
    signOut(this.httpContext)
    return this.noContent()
  }

  private signInAsync(user: CurrentUserDto): Promise<void> {
    return signIn(this.httpContext, {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      credentialVersion: user.credentialVersion,
    })
  }
}

/** [Route("api/v1/auth")] */
export const AuthController: ControllerMetadata<AuthControllerImpl> = {
  route: 'auth',
  create: services => new AuthControllerImpl(
    services.authenticationService,
    services.accessRequestService,
    services.credentialService,
    createLogger('AuthController')),
  actions: [
    { method: 'POST', template: 'register', allowAnonymous: true, rateLimit: 'login', handler: c => c.register() },
    { method: 'POST', template: 'login', allowAnonymous: true, rateLimit: 'login', handler: c => c.login() },
    { method: 'GET', template: 'me', handler: c => c.me() },
    { method: 'POST', template: 'role-context', handler: c => c.switchRole() },
    { method: 'POST', template: 'change-username', handler: c => c.changeUsername() },
    { method: 'POST', template: 'change-password', handler: c => c.changePassword() },
    { method: 'POST', template: 'logout', handler: c => c.logout() },
  ],
}
