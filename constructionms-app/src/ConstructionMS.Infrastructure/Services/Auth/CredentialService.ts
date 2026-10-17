import { and, eq, ne } from 'drizzle-orm'
import { compare, hash } from 'bcryptjs'
import {
  ArgumentError, InvalidOperationError, UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import type { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import type { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'
import type { ICredentialService } from '@/ConstructionMS.Application/Services/Auth/ICredentialService'
import { SecurityAuditEventTypes, SecurityAuditSources } from '@/ConstructionMS.Domain/Entities/SecurityAuditEvent'
import { isUniqueViolation } from '../../Common/DatabaseErrors'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { IsolationLevel, type AppDbContext } from '../../Data/AppDbContext'
import { accessRequests, roles, securityAuditEvents, users } from '../../Data/schema'
import { UsernameReservationLock } from './UsernameReservationLock'

type User = typeof users.$inferSelect

const PasswordWorkFactor = 12
const IntMax = 2_147_483_647
const BcryptHashPattern = /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/

function nextCredentialVersion(current: number): number {
  if (current >= IntMax) {
    throw new RangeError('Arithmetic operation resulted in an overflow.')
  }
  return current + 1
}

export class CredentialService implements ICredentialService {
  constructor(
    private readonly db: AppDbContext,
    private readonly logger: ILogger,
  ) {}

  async changeUsernameAsync(userId: number, request: ChangeUsernameRequestDto): Promise<void> {
    const newUsername = InputNormalizer.username(request.newUsername, 'NewUsername')
    const currentPassword = InputNormalizer.password(request.currentPassword, 'CurrentPassword', 1, 72, 72)
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!user) {
      throw new UnauthorizedAccessError('The authenticated account is inactive.')
    }

    if (!await this.currentPasswordMatches(user, currentPassword)) {
      throw new UnauthorizedAccessError('The current password is incorrect.')
    }

    if (user.username.toUpperCase() === newUsername.toUpperCase()) {
      throw new ArgumentError('Enter a different username.', 'NewUsername')
    }

    try {
      await this.db.transaction(async tx => {
        await UsernameReservationLock.acquireAsync(tx, newUsername)
        const [takenByUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(ne(users.id, user.id), eq(users.normalizedUsername, newUsername)))
          .limit(1)
        const [takenByRequest] = takenByUser
          ? [undefined]
          : await tx
              .select({ id: accessRequests.id })
              .from(accessRequests)
              .where(and(eq(accessRequests.status, 'Pending'), eq(accessRequests.normalizedUsername, newUsername)))
              .limit(1)
        if (takenByUser || takenByRequest) {
          throw new InvalidOperationError('That username is already in use.')
        }

        const displayNameFollowsUsername = user.fullName.trim().toUpperCase() === user.username.toUpperCase()
        await tx
          .update(users)
          .set({
            username: newUsername,
            ...(displayNameFollowsUsername ? { fullName: newUsername } : {}),
            credentialVersion: nextCredentialVersion(user.credentialVersion),
          })
          .where(eq(users.id, user.id))
        await tx.insert(securityAuditEvents).values({
          eventType: SecurityAuditEventTypes.UsernameChanged,
          source: SecurityAuditSources.SelfService,
          targetUserId: user.id,
          actorUserId: user.id,
          occurredAt: new Date(),
        })
      }, { isolationLevel: IsolationLevel.Serializable })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new InvalidOperationError('That username is already in use.')
      }
      throw error
    }
  }

  async changePasswordAsync(userId: number, request: ChangePasswordRequestDto): Promise<void> {
    const currentPassword = InputNormalizer.password(request.currentPassword, 'CurrentPassword', 1, 72, 72)
    const newPassword = CredentialService.normalizeNewPassword(request.newPassword, request.confirmNewPassword)

    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!user) {
      throw new UnauthorizedAccessError('The authenticated account is inactive.')
    }

    if (!await this.currentPasswordMatches(user, currentPassword)) {
      throw new UnauthorizedAccessError('The current password is incorrect.')
    }

    if (await compare(newPassword, user.passwordHash)) {
      throw new ArgumentError('The new password must be different from the current password.', 'NewPassword')
    }

    await this.updatePasswordAsync(
      user,
      newPassword,
      SecurityAuditEventTypes.PasswordChanged,
      SecurityAuditSources.SelfService,
      user.id)
  }

  async resetAdministratorPasswordAsync(username: string, newPassword: string): Promise<void> {
    const normalizedUsername = InputNormalizer.username(username, 'username')
    const normalizedPassword = InputNormalizer.password(newPassword, 'newPassword', 12, 72, 72)

    const [row] = await this.db
      .select({ user: users, roleName: roles.roleName })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.isActive, true), eq(users.normalizedUsername, normalizedUsername)))
      .limit(1)

    if (!row || row.roleName !== 'Administrator') {
      throw new InvalidOperationError('An active Administrator with that username was not found.')
    }

    await this.updatePasswordAsync(
      row.user,
      normalizedPassword,
      SecurityAuditEventTypes.AdministratorPasswordReset,
      SecurityAuditSources.ServerRecovery,
      null)
  }

  private async updatePasswordAsync(
    user: User,
    newPassword: string,
    eventType: string,
    source: string,
    actorUserId: number | null,
  ): Promise<void> {
    const passwordHash = await hash(newPassword, PasswordWorkFactor)
    await this.db.transaction(async tx => {
      await tx
        .update(users)
        .set({ passwordHash, credentialVersion: nextCredentialVersion(user.credentialVersion) })
        .where(eq(users.id, user.id))
      await tx.insert(securityAuditEvents).values({
        eventType,
        source,
        targetUserId: user.id,
        actorUserId,
        occurredAt: new Date(),
      })
    })
  }

  private async currentPasswordMatches(user: User, currentPassword: string): Promise<boolean> {
    if (!BcryptHashPattern.test(user.passwordHash)) {
      this.logger.error('User {UserId} has an invalid password hash.', { UserId: user.id })
      return false
    }

    return compare(currentPassword, user.passwordHash)
  }

  private static normalizeNewPassword(password: string, confirmation: string): string {
    const normalized = InputNormalizer.password(password, 'password', 12, 72, 72)
    const normalizedConfirmation = InputNormalizer.password(confirmation, 'confirmation', 12, 72, 72)
    if (normalized !== normalizedConfirmation) {
      throw new ArgumentError('Passwords do not match.', 'confirmation')
    }

    return normalized
  }
}
