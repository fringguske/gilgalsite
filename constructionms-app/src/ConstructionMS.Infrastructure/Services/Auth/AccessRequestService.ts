import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { hash } from 'bcryptjs'
import {
  ArgumentError, InvalidOperationError, KeyNotFoundError, UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import type {
  AccessRequestResponseDto, ApproveAccessRequestDto, RegisterAccessRequestDto, RejectAccessRequestDto,
} from '@/ConstructionMS.Application/DTOs/Auth/RegisterAccessRequestDto'
import type { IAccessRequestService } from '@/ConstructionMS.Application/Services/Auth/IAccessRequestService'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PhoneNumbers } from '../../Common/PhoneNumbers'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import { accessRequests, projects, roles, userProjectAssignments, users } from '../../Data/schema'
import { UsernameReservationLock } from './UsernameReservationLock'

type AccessRequest = typeof accessRequests.$inferSelect

const PasswordWorkFactor = 12
const AllowedStatuses = ['Pending', 'Approved', 'Rejected']

export class AccessRequestService implements IAccessRequestService {
  constructor(private readonly db: AppDbContext) {}

  async registerAsync(request: RegisterAccessRequestDto): Promise<AccessRequestResponseDto> {
    const username = InputNormalizer.username(request.username, 'Username')
    const email = InputNormalizer.email(request.email, 'Email')
    const phoneNumber = PhoneNumbers.normalize(request.phoneNumber, 'PhoneNumber')
    const password = InputNormalizer.password(request.password, 'Password', 12, 72, 72)
    if (password !== request.confirmPassword) {
      throw new ArgumentError('Passwords do not match.', 'ConfirmPassword')
    }

    const passwordHash = await hash(password, PasswordWorkFactor)
    const accessRequest = await this.db.transaction(async tx => {
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
        throw new InvalidOperationError('That username is already reserved.')
      }

      const [inserted] = await tx
        .insert(accessRequests)
        .values({ username, email, phoneNumber, passwordHash, status: 'Pending', requestedAt: new Date() })
        .returning()
      return inserted!
    }, { isolationLevel: IsolationLevel.Serializable })

    return toDto(accessRequest, null)
  }

  async getAllAsync(page: number, pageSize: number, status: string | null): Promise<PaginatedResult<AccessRequestResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    let normalizedStatus: string | null = null
    if (status !== null && status !== undefined && status.trim() !== '') {
      const trimmed = status.trim().toUpperCase()
      normalizedStatus = AllowedStatuses.find(candidate => candidate.toUpperCase() === trimmed) ?? null
      if (normalizedStatus === null) {
        throw new ArgumentError('Status must be Pending, Approved, or Rejected.', 'status')
      }
    }

    const where = normalizedStatus === null ? undefined : eq(accessRequests.status, normalizedStatus)
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(accessRequests).where(where)
    const rows = await this.db
      .select({ request: accessRequests, reviewedByName: users.fullName })
      .from(accessRequests)
      .leftJoin(users, eq(accessRequests.reviewedByUserId, users.id))
      .where(where)
      .orderBy(desc(accessRequests.requestedAt), desc(accessRequests.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: rows.map(row => toDto(row.request, row.reviewedByName)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async approveAsync(
    requestId: number,
    request: ApproveAccessRequestDto,
    administratorUserId: number,
  ): Promise<AccessRequestResponseDto> {
    InputNormalizer.positiveInt(requestId, 'requestId')
    const projectIds = [...new Set(request.projectIds)].sort((a, b) => a - b)
    if (projectIds.some(id => id <= 0)) {
      throw new ArgumentError('Project IDs must be positive.', 'ProjectIds')
    }

    const approved = await this.db.transaction(async tx => {
      await this.requireAdministratorAsync(tx, administratorUserId)
      const [accessRequest] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1)
      if (!accessRequest) {
        throw new KeyNotFoundError('The access request was not found.')
      }
      if (accessRequest.status !== 'Pending') {
        throw new InvalidOperationError('This access request has already been reviewed.')
      }
      await UsernameReservationLock.acquireAsync(tx, accessRequest.username)

      const [role] = await tx.select().from(roles).where(eq(roles.id, request.roleId)).limit(1)
      if (!role) {
        throw new ArgumentError('The selected role does not exist.', 'RoleId')
      }
      if (role.roleName === 'Administrator') {
        throw new UnauthorizedAccessError('Administrator accounts cannot be granted through public access requests.')
      }

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.normalizedUsername, accessRequest.username))
        .limit(1)
      if (existingUser) {
        throw new InvalidOperationError('That username already belongs to a user account.')
      }

      const projectCount = projectIds.length === 0
        ? 0
        : (await tx.select({ value: count() }).from(projects).where(inArray(projects.id, projectIds)))[0]?.value ?? 0
      if (projectCount !== projectIds.length) {
        throw new ArgumentError('One or more selected projects do not exist.', 'ProjectIds')
      }

      const now = new Date()
      const [user] = await tx
        .insert(users)
        .values({
          username: accessRequest.username,
          fullName: accessRequest.username,
          email: accessRequest.email,
          // Requests made before phone numbers were collected have none; the person adds one after signing in.
          phoneNumber: accessRequest.phoneNumber ?? 'Not provided',
          passwordHash: accessRequest.passwordHash,
          roleId: role.id,
          isActive: true,
          createdAt: now,
        })
        .returning()
      if (projectIds.length > 0) {
        await tx.insert(userProjectAssignments).values(projectIds.map(projectId => ({
          userId: user!.id,
          projectId,
          assignedByUserId: administratorUserId,
          isActive: true,
          createdAt: now,
        })))
      }

      const [updated] = await tx
        .update(accessRequests)
        .set({
          status: 'Approved',
          reviewedAt: now,
          reviewedByUserId: administratorUserId,
          approvedUserId: user!.id,
          decisionNote: `Approved as ${role.roleName}`,
          passwordHash: 'APPROVED',
        })
        .where(eq(accessRequests.id, accessRequest.id))
        .returning()
      return updated!
    }, { isolationLevel: IsolationLevel.Serializable })

    return toDto(approved, await this.reviewerNameAsync(approved))
  }

  async rejectAsync(
    requestId: number,
    request: RejectAccessRequestDto,
    administratorUserId: number,
  ): Promise<AccessRequestResponseDto> {
    InputNormalizer.positiveInt(requestId, 'requestId')
    const rejected = await this.db.transaction(async tx => {
      await this.requireAdministratorAsync(tx, administratorUserId)
      const [accessRequest] = await tx.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1)
      if (!accessRequest) {
        throw new KeyNotFoundError('The access request was not found.')
      }
      if (accessRequest.status !== 'Pending') {
        throw new InvalidOperationError('This access request has already been reviewed.')
      }

      const reviewedAt = new Date()
      const decisionNote = InputNormalizer.requiredText(request.reason, 'Reason', 3, 500)
      const [updated] = await tx
        .update(accessRequests)
        .set({
          status: 'Rejected',
          reviewedAt,
          reviewedByUserId: administratorUserId,
          decisionNote,
          passwordHash: 'REJECTED',
        })
        .where(eq(accessRequests.id, accessRequest.id))
        .returning()
      return updated!
    }, { isolationLevel: IsolationLevel.Serializable })

    return toDto(rejected, await this.reviewerNameAsync(rejected))
  }

  private async reviewerNameAsync(accessRequest: AccessRequest): Promise<string | null> {
    if (accessRequest.reviewedByUserId === null) {
      return null
    }

    const [reviewer] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, accessRequest.reviewedByUserId))
      .limit(1)
    return reviewer?.fullName ?? null
  }

  private async requireAdministratorAsync(db: DbExecutor, userId: number): Promise<void> {
    const [administrator] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, userId), eq(users.isActive, true), eq(roles.roleName, 'Administrator')))
      .limit(1)
    if (!administrator) {
      throw new UnauthorizedAccessError('Only an active Administrator may review access requests.')
    }
  }
}

function toDto(request: AccessRequest, reviewedByName: string | null): AccessRequestResponseDto {
  return {
    id: request.id,
    username: request.username,
    email: request.email,
    phoneNumber: request.phoneNumber,
    status: request.status,
    requestedAt: request.requestedAt,
    reviewedAt: request.reviewedAt,
    reviewedByName,
    approvedUserId: request.approvedUserId,
    decisionNote: request.decisionNote,
  }
}
