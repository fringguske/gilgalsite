import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'
import { compare, hash } from 'bcryptjs'
import {
  ArgumentError, InvalidOperationError, UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import type { ILogger } from '@/ConstructionMS.Application/Common/Logger'
import type { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import type { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'
import type {
  ChangePhoneNumberRequestDto, ConfirmPhoneNumberRequestDto, ResetPasswordRequestDto, SendPasswordChangeCodeRequestDto,
  SendPasswordResetCodeRequestDto, VerificationCodeSentDto,
} from '@/ConstructionMS.Application/DTOs/Auth/PhoneVerificationDtos'
import type { ICredentialService } from '@/ConstructionMS.Application/Services/Auth/ICredentialService'
import { PhoneVerificationPurposes } from '@/ConstructionMS.Domain/Entities/PhoneVerificationCode'
import { SecurityAuditEventTypes, SecurityAuditSources } from '@/ConstructionMS.Domain/Entities/SecurityAuditEvent'
import { isUniqueViolation } from '../../Common/DatabaseErrors'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PhoneNumbers } from '../../Common/PhoneNumbers'
import { IsolationLevel, type AppDbContext } from '../../Data/AppDbContext'
import { accessRequests, roles, securityAuditEvents, users } from '../../Data/schema'
import type { PhoneVerificationService } from './PhoneVerificationService'
import { UsernameReservationLock } from './UsernameReservationLock'

type User = typeof users.$inferSelect

const PasswordWorkFactor = 12
const IntMax = 2_147_483_647
const BcryptHashPattern = /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/
// Once a number is proven, only an Administrator can replace it: otherwise anyone who learnt the
// password could point the account at their own phone and then change the password.
const VerifiedPhoneNumberLocked = 'Your phone number is already verified. Ask an Administrator to change it.'

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
    private readonly phoneVerification: PhoneVerificationService,
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

  async sendPasswordChangeCodeAsync(
    userId: number,
    request: SendPasswordChangeCodeRequestDto,
  ): Promise<VerificationCodeSentDto> {
    this.phoneVerification.ensureEnabled()
    const currentPassword = InputNormalizer.password(request.currentPassword, 'CurrentPassword', 1, 72, 72)
    const user = await this.requireActiveUserAsync(userId)
    if (!await this.currentPasswordMatches(user, currentPassword)) {
      throw new UnauthorizedAccessError('The current password is incorrect.')
    }

    const phoneNumber = PhoneNumbers.tryNormalize(user.phoneNumber)
    if (phoneNumber === null) {
      throw new InvalidOperationError('Add your phone number before changing your password.')
    }

    return this.phoneVerification.sendCodeAsync(user.id, PhoneVerificationPurposes.ChangePassword, phoneNumber)
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

    // While SMS is configured a password change also needs the code texted to the account's phone.
    let newlyVerifiedPhoneNumber: string | null = null
    if (this.phoneVerification.enabled) {
      if (!request.verificationCode) {
        throw new ArgumentError('Enter the 6-digit code sent to your phone.', 'VerificationCode')
      }
      const sentTo = await this.phoneVerification.consumeCodeAsync(
        user.id, PhoneVerificationPurposes.ChangePassword, request.verificationCode)
      if (sentTo !== PhoneNumbers.tryNormalize(user.phoneNumber)) {
        throw new InvalidOperationError('Your phone number changed after the code was sent. Request a new code.')
      }
      // Receiving the code proves the number on file, e.g. one entered on the Request access form.
      newlyVerifiedPhoneNumber = user.phoneNumberVerifiedAt === null ? sentTo : null
    }

    await this.updatePasswordAsync(
      user,
      newPassword,
      SecurityAuditEventTypes.PasswordChanged,
      SecurityAuditSources.SelfService,
      user.id,
      newlyVerifiedPhoneNumber)
  }

  async startPhoneNumberChangeAsync(
    userId: number,
    request: ChangePhoneNumberRequestDto,
  ): Promise<VerificationCodeSentDto> {
    this.phoneVerification.ensureEnabled()
    const phoneNumber = PhoneNumbers.normalize(request.phoneNumber, 'PhoneNumber')
    const currentPassword = InputNormalizer.password(request.currentPassword, 'CurrentPassword', 1, 72, 72)
    const user = await this.requireActiveUserAsync(userId)
    if (!await this.currentPasswordMatches(user, currentPassword)) {
      throw new UnauthorizedAccessError('The current password is incorrect.')
    }
    if (user.phoneNumberVerifiedAt !== null) {
      throw new InvalidOperationError(VerifiedPhoneNumberLocked)
    }

    return this.phoneVerification.sendCodeAsync(user.id, PhoneVerificationPurposes.VerifyPhoneNumber, phoneNumber)
  }

  async confirmPhoneNumberAsync(userId: number, request: ConfirmPhoneNumberRequestDto): Promise<void> {
    this.phoneVerification.ensureEnabled()
    const user = await this.requireActiveUserAsync(userId)
    if (user.phoneNumberVerifiedAt !== null) {
      throw new InvalidOperationError(VerifiedPhoneNumberLocked)
    }

    const phoneNumber = await this.phoneVerification.consumeCodeAsync(
      user.id, PhoneVerificationPurposes.VerifyPhoneNumber, request.verificationCode)
    const now = new Date()
    await this.db.transaction(async tx => {
      const updated = await tx
        .update(users)
        .set({ phoneNumber, phoneNumberVerifiedAt: now })
        .where(and(eq(users.id, user.id), isNull(users.phoneNumberVerifiedAt)))
        .returning({ id: users.id })
      if (updated.length === 0) {
        throw new InvalidOperationError(VerifiedPhoneNumberLocked)
      }
      await tx.insert(securityAuditEvents).values({
        eventType: SecurityAuditEventTypes.PhoneNumberVerified,
        source: SecurityAuditSources.SelfService,
        targetUserId: user.id,
        actorUserId: user.id,
        occurredAt: now,
      })
    })
  }

  async sendPasswordResetCodeAsync(request: SendPasswordResetCodeRequestDto): Promise<void> {
    this.phoneVerification.ensureEnabled()
    const username = InputNormalizer.username(request.username, 'Username')
    const account = await this.findResettableAccountAsync(username)
    if (account === null) {
      this.logger.information('No password reset code was sent: no active account with a confirmed phone number.')
      return
    }

    try {
      await this.phoneVerification.sendCodeAsync(account.user.id, PhoneVerificationPurposes.ResetPassword, account.phoneNumber)
    } catch (error) {
      // The limits are per account, so reporting them would confirm the account exists. An earlier code still works.
      if (error instanceof InvalidOperationError) {
        this.logger.warning('Password reset code for user {UserId} was not sent.', { UserId: account.user.id }, error)
        return
      }
      throw error
    }
  }

  async resetPasswordAsync(request: ResetPasswordRequestDto): Promise<void> {
    this.phoneVerification.ensureEnabled()
    const username = InputNormalizer.username(request.username, 'Username')
    // Checked before the code, so a mistyped confirmation does not use up the code.
    const newPassword = CredentialService.normalizeNewPassword(request.newPassword, request.confirmNewPassword)
    const account = await this.findResettableAccountAsync(username)
    if (account === null) {
      throw new UnauthorizedAccessError('Request a new verification code.')
    }

    const sentTo = await this.phoneVerification.consumeCodeAsync(
      account.user.id, PhoneVerificationPurposes.ResetPassword, request.verificationCode)
    if (sentTo !== account.phoneNumber) {
      throw new InvalidOperationError('Your phone number changed after the code was sent. Request a new code.')
    }

    await this.updatePasswordAsync(
      account.user,
      newPassword,
      SecurityAuditEventTypes.PasswordReset,
      SecurityAuditSources.SelfService,
      account.user.id)
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
    newlyVerifiedPhoneNumber: string | null = null,
  ): Promise<void> {
    const passwordHash = await hash(newPassword, PasswordWorkFactor)
    const now = new Date()
    await this.db.transaction(async tx => {
      await tx
        .update(users)
        .set({
          passwordHash,
          credentialVersion: nextCredentialVersion(user.credentialVersion),
          ...(newlyVerifiedPhoneNumber === null
            ? {}
            : { phoneNumber: newlyVerifiedPhoneNumber, phoneNumberVerifiedAt: now }),
        })
        .where(eq(users.id, user.id))
      await tx.insert(securityAuditEvents).values([
        { eventType, source, targetUserId: user.id, actorUserId, occurredAt: now },
        ...(newlyVerifiedPhoneNumber === null ? [] : [{
          eventType: SecurityAuditEventTypes.PhoneNumberVerified,
          source,
          targetUserId: user.id,
          actorUserId,
          occurredAt: now,
        }]),
      ])
    })
  }

  /**
   * The code alone replaces the password, so it only goes to a number the person has proven they hold.
   * An unconfirmed number may have been typed by someone else, e.g. an Administrator editing the account.
   */
  private async findResettableAccountAsync(
    normalizedUsername: string,
  ): Promise<{ user: User; phoneNumber: string } | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(
        eq(users.normalizedUsername, normalizedUsername),
        eq(users.isActive, true),
        isNotNull(users.phoneNumberVerifiedAt)))
      .limit(1)
    const phoneNumber = PhoneNumbers.tryNormalize(user?.phoneNumber)
    return user && phoneNumber ? { user, phoneNumber } : null
  }

  private async requireActiveUserAsync(userId: number): Promise<User> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!user) {
      throw new UnauthorizedAccessError('The authenticated account is inactive.')
    }
    return user
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
