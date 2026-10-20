/**
 * Resolves the effective role for the current request while preserving the
 * account's actual database role.
 */
export interface IActorRoleResolver {
  resolveAsync(userId: number, requestedRole?: string | null): Promise<ActorRoleContext | null>
}

export interface ActorRoleContext {
  readonly userId: number
  readonly username: string
  readonly fullName: string
  readonly email: string
  readonly emailVerified: boolean
  readonly credentialVersion: number
  readonly actualRole: string
  readonly effectiveRole: string
  readonly canSwitchRoles: boolean
  readonly availableRoles: readonly string[]
}
