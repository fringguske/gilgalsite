import { and, asc, eq } from 'drizzle-orm'
import type { ItVerificationOptions } from '@/ConstructionMS.Application/Configuration/ItVerificationOptions'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { ICurrentActorContext } from '@/ConstructionMS.Application/Services/Auth/ICurrentActorContext'
import type { AppDbContext } from '../../Data/AppDbContext'
import { roles, users } from '../../Data/schema'

const AdministratorRole = 'Administrator'

function isNullOrWhiteSpace(value: string | null | undefined): value is null | undefined {
  return value === null || value === undefined || value.trim() === ''
}

export class ActorRoleResolver implements IActorRoleResolver {
  constructor(
    private readonly db: AppDbContext,
    private readonly currentActor: ICurrentActorContext,
    private readonly options: ItVerificationOptions,
  ) {}

  async resolveAsync(userId: number, requestedRole: string | null = null): Promise<ActorRoleContext | null> {
    if (userId <= 0) {
      return null
    }

    const [user] = await this.db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        credentialVersion: users.credentialVersion,
        actualRole: roles.roleName,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)

    if (!user) {
      return null
    }

    let effectiveRoleRequest: string | null | undefined = requestedRole
    if (isNullOrWhiteSpace(effectiveRoleRequest) && this.currentActor.userId === userId) {
      effectiveRoleRequest = this.currentActor.effectiveRole
    }

    effectiveRoleRequest = isNullOrWhiteSpace(effectiveRoleRequest) ? user.actualRole : effectiveRoleRequest.trim()

    const testerMatches = this.options.testerUserId !== null && this.options.testerUserId > 0
      ? user.id === this.options.testerUserId
      : !isNullOrWhiteSpace(this.options.testerUsername)
        && user.username.trim().toUpperCase() === this.options.testerUsername.trim().toUpperCase()
    const isConfiguredTester = this.options.enabled && user.actualRole === AdministratorRole && testerMatches

    let availableRoles: string[] = []
    let effectiveRole: string | null
    if (isConfiguredTester) {
      const rows = await this.db.select({ roleName: roles.roleName }).from(roles).orderBy(asc(roles.id))
      availableRoles = rows.map(row => row.roleName)
      const requested = effectiveRoleRequest.toUpperCase()
      effectiveRole = availableRoles.find(role => role.toUpperCase() === requested) ?? null
    } else {
      effectiveRole = user.actualRole === effectiveRoleRequest ? user.actualRole : null
    }

    return effectiveRole === null
      ? null
      : {
          userId: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          credentialVersion: user.credentialVersion,
          actualRole: user.actualRole,
          effectiveRole,
          canSwitchRoles: isConfiguredTester,
          availableRoles,
        }
  }
}
