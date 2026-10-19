import { and, asc, count, eq, isNull, ne, or } from 'drizzle-orm'
import { hash } from 'bcryptjs'
import {
  ArgumentError, InvalidOperationError, UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import type { CreateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/CreateUserRequestDto'
import type { UpdateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/UpdateUserRequestDto'
import type { UserResponseDto } from '@/ConstructionMS.Application/DTOs/Users/UserResponseDto'
import type { IUserService } from '@/ConstructionMS.Application/Services/Users/IUserService'
import { SecurityAuditEventTypes, SecurityAuditSources } from '@/ConstructionMS.Domain/Entities/SecurityAuditEvent'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PhoneNumbers } from '../../Common/PhoneNumbers'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import { accessRequests, roles, securityAuditEvents, users } from '../../Data/schema'
import { UsernameReservationLock } from '../Auth/UsernameReservationLock'

type User = typeof users.$inferSelect

const PasswordWorkFactor = 12

/** Persists users and hashes passwords with BCrypt. */
export class UserService implements IUserService {
  constructor(private readonly db: AppDbContext) {}

  async getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<UserResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(users)
    const rows = await this.db
      .select({ user: users, roleName: roles.roleName })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .orderBy(asc(users.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: rows.map(row => toDto(row.user, row.roleName)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number): Promise<UserResponseDto | null> {
    return this.getByIdWithAsync(this.db, id)
  }

  async createAsync(dto: CreateUserRequestDto, administratorUserId: number | null = null): Promise<UserResponseDto> {
    return this.db.transaction(async tx => {
      if (administratorUserId !== null) {
        await this.requireAdministratorAsync(tx, administratorUserId)
      }

      const email = InputNormalizer.email(dto.email, 'Email')
      const username = InputNormalizer.username(dto.username, 'Username')
      await UsernameReservationLock.acquireAsync(tx, username)

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.normalizedUsername, username))
        .limit(1)
      const [pendingRequest] = existingUser
        ? [undefined]
        : await tx
            .select({ id: accessRequests.id })
            .from(accessRequests)
            .where(and(eq(accessRequests.status, 'Pending'), eq(accessRequests.normalizedUsername, username)))
            .limit(1)
      if (existingUser || pendingRequest) {
        throw new InvalidOperationError('A user with that username already exists.')
      }

      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, dto.roleId)).limit(1)
      if (!role) {
        throw new ArgumentError('The selected role does not exist.', 'RoleId')
      }

      const fullName = InputNormalizer.requiredText(dto.fullName, 'FullName', 2, 150)
      const phoneNumber = PhoneNumbers.normalize(dto.phoneNumber, 'PhoneNumber')
      const passwordHash = await hash(
        InputNormalizer.password(dto.password, 'Password', 12, 72, 72),
        PasswordWorkFactor)

      const [user] = await tx
        .insert(users)
        .values({
          username,
          fullName,
          email,
          phoneNumber,
          passwordHash,
          roleId: dto.roleId,
          isActive: true,
          createdAt: new Date(),
        })
        .returning()
      if (administratorUserId !== null) {
        await this.appendAdministratorAuditEventAsync(tx, SecurityAuditEventTypes.UserCreated, user!, administratorUserId)
      }

      return (await this.getByIdWithAsync(tx, user!.id))!
    }, { isolationLevel: IsolationLevel.Serializable })
  }

  async updateAsync(id: number, dto: UpdateUserRequestDto, administratorUserId: number): Promise<UserResponseDto | null> {
    const updatedId = await this.db.transaction(async tx => {
      await this.requireAdministratorAsync(tx, administratorUserId)
      const [user] = await tx.select().from(users).where(eq(users.id, id)).limit(1)
      if (!user) return null

      const email = InputNormalizer.email(dto.email, 'Email')
      const username = InputNormalizer.username(dto.username, 'Username')
      await UsernameReservationLock.acquireAsync(tx, username)

      const [takenByUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(ne(users.id, id), eq(users.normalizedUsername, username)))
        .limit(1)
      const [takenByRequest] = takenByUser
        ? [undefined]
        : await tx
            .select({ id: accessRequests.id })
            .from(accessRequests)
            .where(and(
              eq(accessRequests.status, 'Pending'),
              // EF's C# null semantics for `ApprovedUserId != id`: NULL counts as "not equal".
              or(isNull(accessRequests.approvedUserId), ne(accessRequests.approvedUserId, id)),
              eq(accessRequests.normalizedUsername, username)))
            .limit(1)
      if (takenByUser || takenByRequest) {
        throw new InvalidOperationError('A user with that username already exists.')
      }

      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, dto.roleId)).limit(1)
      if (!role) {
        throw new ArgumentError('The selected role does not exist.', 'RoleId')
      }

      const roleChanged = user.roleId !== dto.roleId
      if (roleChanged) {
        const currentRole = await this.requireRoleNameAsync(tx, user.roleId)
        const nextRole = await this.requireRoleNameAsync(tx, dto.roleId)
        if ((currentRole === 'CEO' || currentRole === 'Administrator')
          && nextRole !== currentRole
          && user.isActive
          && await this.countActiveUsersInRoleAsync(tx, currentRole) <= 1) {
          throw new InvalidOperationError(`The final active ${currentRole} cannot be moved to another role.`)
        }
      }

      const fullName = InputNormalizer.requiredText(dto.fullName, 'FullName', 2, 150)
      // A new number must be one an SMS can reach, and the person has to prove it again with a code.
      const phoneNumberInput = InputNormalizer.requiredText(dto.phoneNumber, 'PhoneNumber', 1, 30)
      const phoneNumber = phoneNumberInput === user.phoneNumber
        ? user.phoneNumber
        : PhoneNumbers.normalize(phoneNumberInput, 'PhoneNumber')
      const phoneNumberChanged = phoneNumber !== user.phoneNumber
        && phoneNumber !== PhoneNumbers.tryNormalize(user.phoneNumber)
      const profileChanged = user.fullName !== fullName
        || user.username !== username
        || user.email !== email
        || user.phoneNumber !== phoneNumber

      await tx
        .update(users)
        .set({
          fullName,
          username,
          email,
          phoneNumber,
          roleId: dto.roleId,
          ...(phoneNumberChanged ? { phoneNumberVerifiedAt: null } : {}),
        })
        .where(eq(users.id, id))

      if (profileChanged) {
        await this.appendAdministratorAuditEventAsync(tx, SecurityAuditEventTypes.UserProfileUpdated, user, administratorUserId)
      }
      if (roleChanged) {
        await this.appendAdministratorAuditEventAsync(tx, SecurityAuditEventTypes.UserRoleChanged, user, administratorUserId)
      }

      return id
    }, { isolationLevel: IsolationLevel.Serializable })

    if (updatedId === null) return null
    const updated = await this.getByIdAsync(id)
    if (updated === null) {
      throw new InvalidOperationError('User was saved but could not be retrieved.')
    }
    return updated
  }

  async setActiveStatusAsync(id: number, isActive: boolean, administratorUserId: number): Promise<boolean> {
    return this.db.transaction(async tx => {
      await this.requireAdministratorAsync(tx, administratorUserId)
      const [user] = await tx.select().from(users).where(eq(users.id, id)).limit(1)
      if (!user) return false

      if (!isActive && user.isActive) {
        const [protectedRole] = await tx
          .select({ roleName: roles.roleName })
          .from(roles)
          .where(and(eq(roles.id, user.roleId), or(eq(roles.roleName, 'CEO'), eq(roles.roleName, 'Administrator'))))
          .limit(1)
        if (protectedRole && await this.countActiveUsersInRoleAsync(tx, protectedRole.roleName) <= 1) {
          throw new InvalidOperationError(`The final active ${protectedRole.roleName} cannot be deactivated.`)
        }
      }

      if (user.isActive === isActive) {
        return true
      }

      await tx.update(users).set({ isActive }).where(eq(users.id, id))
      await this.appendAdministratorAuditEventAsync(
        tx,
        isActive ? SecurityAuditEventTypes.UserActivated : SecurityAuditEventTypes.UserDeactivated,
        user,
        administratorUserId)
      return true
    }, { isolationLevel: IsolationLevel.Serializable })
  }

  private async getByIdWithAsync(db: DbExecutor, id: number): Promise<UserResponseDto | null> {
    const [row] = await db
      .select({ user: users, roleName: roles.roleName })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1)
    return row ? toDto(row.user, row.roleName) : null
  }

  private async requireRoleNameAsync(db: DbExecutor, roleId: number): Promise<string> {
    const [role] = await db.select({ roleName: roles.roleName }).from(roles).where(eq(roles.id, roleId)).limit(1)
    if (!role) {
      throw new InvalidOperationError('Sequence contains no elements')
    }
    return role.roleName
  }

  private async requireAdministratorAsync(db: DbExecutor, userId: number): Promise<void> {
    const [administrator] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, userId), eq(users.isActive, true), eq(roles.roleName, 'Administrator')))
      .limit(1)
    if (!administrator) {
      throw new UnauthorizedAccessError('Only an active Administrator may manage users.')
    }
  }

  private async appendAdministratorAuditEventAsync(
    db: DbExecutor,
    eventType: string,
    targetUser: User,
    administratorUserId: number,
  ): Promise<void> {
    await db.insert(securityAuditEvents).values({
      eventType,
      source: SecurityAuditSources.Administrator,
      targetUserId: targetUser.id,
      actorUserId: administratorUserId,
      occurredAt: new Date(),
    })
  }

  private async countActiveUsersInRoleAsync(db: DbExecutor, roleName: string): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.isActive, true), eq(roles.roleName, roleName)))
    return result?.value ?? 0
  }
}

function toDto(u: User, roleName: string): UserResponseDto {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    phoneNumber: u.phoneNumber,
    phoneNumberVerified: u.phoneNumberVerifiedAt !== null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    roleId: u.roleId,
    roleName,
  }
}
