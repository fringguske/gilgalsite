import { and, asc, eq, exists, sql } from 'drizzle-orm'
import { compare } from 'bcryptjs'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import type { AssignedProjectDto, CurrentUserDto } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'
import type { LoginRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/LoginRequestDto'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IAuthenticationService } from '@/ConstructionMS.Application/Services/Auth/IAuthenticationService'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PhoneNumbers } from '../../Common/PhoneNumbers'
import type { AppDbContext } from '../../Data/AppDbContext'
import { projects, roles, userProjectAssignments, users } from '../../Data/schema'

// A valid BCrypt hash used only to keep unknown-username work comparable to
// wrong-password work. It is not an application credential.
const DummyPasswordHash = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW'
const BcryptHashPattern = /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/

export class AuthenticationService implements IAuthenticationService {
  constructor(
    private readonly db: AppDbContext,
    private readonly logger: ILogger,
    private readonly actorRoleResolver: IActorRoleResolver,
    private readonly smsVerificationEnabled: boolean,
  ) {}

  async authenticateAsync(request: LoginRequestDto): Promise<CurrentUserDto | null> {
    const normalizedUsername = InputNormalizer.username(request.username, 'Username')
    const [user] = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        roleName: roles.roleName,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.isActive, true), eq(users.normalizedUsername, normalizedUsername)))
      .limit(1)

    if (!user) {
      await compare(request.password, DummyPasswordHash)
      return null
    }

    // A damaged legacy hash must fail closed without disclosing account state.
    if (!BcryptHashPattern.test(user.passwordHash)) {
      this.logger.error('User {UserId} has an invalid password hash.', { UserId: user.id })
      return null
    }

    if (!await compare(request.password, user.passwordHash)) {
      return null
    }

    const actor = await this.actorRoleResolver.resolveAsync(user.id, user.roleName)
    return actor === null ? null : this.buildCurrentUserAsync(actor)
  }

  async getCurrentUserAsync(userId: number, effectiveRole: string | null = null): Promise<CurrentUserDto | null> {
    const actor = await this.actorRoleResolver.resolveAsync(userId, effectiveRole)
    return actor === null ? null : this.buildCurrentUserAsync(actor)
  }

  private async buildCurrentUserAsync(actor: ActorRoleContext): Promise<CurrentUserDto> {
    const seesAllProjects = actor.canSwitchRoles
      || actor.effectiveRole === 'Administrator'
      || actor.effectiveRole === 'CEO'
      || actor.effectiveRole === 'Auditor'

    const assigned: AssignedProjectDto[] = await this.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(seesAllProjects
        ? undefined
        : exists(this.db
            .select({ one: sql`1` })
            .from(userProjectAssignments)
            .where(and(
              eq(userProjectAssignments.userId, actor.userId),
              eq(userProjectAssignments.projectId, projects.id),
              eq(userProjectAssignments.isActive, true)))))
      .orderBy(asc(projects.id))

    return {
      id: actor.userId,
      username: actor.username,
      fullName: actor.fullName,
      email: actor.email,
      phoneNumber: PhoneNumbers.tryNormalize(actor.phoneNumber),
      phoneNumberVerified: actor.phoneNumberVerified,
      smsVerificationEnabled: this.smsVerificationEnabled,
      role: actor.effectiveRole,
      actualRole: actor.actualRole,
      canSwitchRoles: actor.canSwitchRoles,
      availableRoles: [...actor.availableRoles],
      projects: assigned,
      credentialVersion: actor.credentialVersion,
    }
  }
}
