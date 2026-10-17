import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  ArgumentError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  CreateSupplierOnboardingRequestDto,
  ReviewSupplierOnboardingRequestDto,
  SupplierOnboardingResponseDto,
} from '@/ConstructionMS.Application/DTOs/Suppliers/SupplierOnboardingDtos'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { ISupplierOnboardingService } from '@/ConstructionMS.Application/Services/Suppliers/ISupplierOnboardingService'
import { SupplierOnboardingStatuses } from '@/ConstructionMS.Domain/Entities/SupplierOnboardingRequest'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import { supplierOnboardingRequests, suppliers, users } from '../../Data/schema'

type OnboardingRow = typeof supplierOnboardingRequests.$inferSelect

const AllowedStatuses = [
  SupplierOnboardingStatuses.Pending,
  SupplierOnboardingStatuses.Approved,
  SupplierOnboardingStatuses.Rejected,
]

const submitter = alias(users, 'submitter')
const reviewer = alias(users, 'reviewer')

interface RequestWithNames {
  request: OnboardingRow
  submittedByName: string
  reviewedByName: string | null
}

export class SupplierOnboardingService implements ISupplierOnboardingService {
  constructor(
    private readonly db: AppDbContext,
    private readonly actorRoleResolver: IActorRoleResolver,
  ) {}

  async getByIdAsync(requestId: number): Promise<SupplierOnboardingResponseDto | null> {
    InputNormalizer.positiveInt(requestId, 'requestId')
    const [row] = await requestQuery(this.db).where(eq(supplierOnboardingRequests.id, requestId)).limit(1)
    return row ? toDto(row) : null
  }

  async getAllAsync(
    page: number,
    pageSize: number,
    status: string | null,
  ): Promise<PaginatedResult<SupplierOnboardingResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    let normalizedStatus: string | null = null
    if (status !== null && status.trim() !== '') {
      const match = AllowedStatuses.find(candidate => candidate.toLowerCase() === status.trim().toLowerCase())
      if (match === undefined) {
        throw new ArgumentError('Status must be Pending, Approved, or Rejected.', 'status')
      }
      normalizedStatus = match
    }

    const filter: SQL | undefined = normalizedStatus === null
      ? undefined
      : eq(supplierOnboardingRequests.status, normalizedStatus)

    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(supplierOnboardingRequests)
      .where(filter)
    const rows = await requestQuery(this.db)
      .where(filter)
      .orderBy(
        sql`CASE WHEN ${supplierOnboardingRequests.status} = ${SupplierOnboardingStatuses.Pending} THEN 0 ELSE 1 END`,
        desc(supplierOnboardingRequests.submittedAt),
        desc(supplierOnboardingRequests.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: rows.map(toDto),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async submitAsync(
    request: CreateSupplierOnboardingRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierOnboardingResponseDto> {
    await this.requireActorRoleAsync(actorUserId, actorRole, 'Procurement Officer')

    const name = InputNormalizer.requiredText(request.name, 'Name', 2, 200)
    const contactPerson = InputNormalizer.requiredText(request.contactPerson, 'ContactPerson', 2, 150)
    const phoneNumber = InputNormalizer.requiredText(request.phoneNumber, 'PhoneNumber', 7, 30)
    const email = InputNormalizer.optionalEmail(request.email, 'Email')
    const kraPin = InputNormalizer.requiredText(request.kraPin, 'KraPin', 5, 20).toUpperCase()
    const mpesaNumber = InputNormalizer.optionalText(request.mpesaNumber, 'MpesaNumber', 30)
    const category = InputNormalizer.requiredText(request.category, 'Category', 2, 100)

    const id = await this.db.transaction(async (tx) => {
      const [existingSupplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.normalizedKraPin, kraPin))
        .limit(1)
      if (existingSupplier) {
        throw new InvalidOperationError('That KRA PIN already belongs to an approved supplier.')
      }

      const [pending] = await tx
        .select({ id: supplierOnboardingRequests.id })
        .from(supplierOnboardingRequests)
        .where(and(
          eq(supplierOnboardingRequests.status, SupplierOnboardingStatuses.Pending),
          eq(supplierOnboardingRequests.normalizedKraPin, kraPin)))
        .limit(1)
      if (pending) {
        throw new InvalidOperationError('That KRA PIN already has a supplier application awaiting review.')
      }

      const now = new Date()
      const stamp = now.toISOString().slice(0, 19).replace(/\D/g, '')
      const [onboarding] = await tx
        .insert(supplierOnboardingRequests)
        .values({
          requestNumber: `SUP-ONB-${stamp}-${randomUUID().replace(/-/g, '')}`.slice(0, 31).toUpperCase(),
          name,
          contactPerson,
          phoneNumber,
          email,
          kraPin,
          mpesaNumber,
          category,
          status: SupplierOnboardingStatuses.Pending,
          submittedByUserId: actorUserId,
          submittedAt: now,
        })
        .returning({ id: supplierOnboardingRequests.id })
      return onboarding!.id
    }, { isolationLevel: IsolationLevel.Serializable })

    return await this.loadAsync(id)
  }

  async reviewAsync(
    requestId: number,
    request: ReviewSupplierOnboardingRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierOnboardingResponseDto> {
    InputNormalizer.positiveInt(requestId, 'requestId')
    await this.requireActorRoleAsync(actorUserId, actorRole, 'CEO', 'Finance Officer')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)

    const id = await this.db.transaction(async (tx) => {
      const [onboarding] = await tx
        .select()
        .from(supplierOnboardingRequests)
        .where(eq(supplierOnboardingRequests.id, requestId))
        .limit(1)
      if (!onboarding) {
        throw new KeyNotFoundError('The supplier onboarding request was not found.')
      }

      if (onboarding.status !== SupplierOnboardingStatuses.Pending) {
        throw new InvalidOperationError('This supplier onboarding request has already received a final decision.')
      }

      if (onboarding.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError(
          'The person who submitted a supplier cannot approve or reject that supplier.')
      }

      let supplierId: number | null = null
      if (request.approve) {
        const [existing] = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.normalizedKraPin, onboarding.kraPin))
          .limit(1)
        if (existing) {
          throw new InvalidOperationError('That KRA PIN already belongs to an approved supplier.')
        }

        const [supplier] = await tx
          .insert(suppliers)
          .values({
            name: onboarding.name,
            contactPerson: onboarding.contactPerson,
            phoneNumber: onboarding.phoneNumber,
            email: onboarding.email,
            kraPin: onboarding.kraPin,
            mpesaNumber: onboarding.mpesaNumber,
            category: onboarding.category,
            isBlacklisted: false,
            createdAt: new Date(),
          })
          .returning({ id: suppliers.id })
        supplierId = supplier!.id
      }

      await tx
        .update(supplierOnboardingRequests)
        .set({
          status: request.approve ? SupplierOnboardingStatuses.Approved : SupplierOnboardingStatuses.Rejected,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: notes,
          approvedSupplierId: supplierId,
        })
        .where(eq(supplierOnboardingRequests.id, onboarding.id))
      return onboarding.id
    }, { isolationLevel: IsolationLevel.Serializable })

    return await this.loadAsync(id)
  }

  private async requireActorRoleAsync(actorUserId: number, actorRole: string, ...allowedRoles: string[]): Promise<void> {
    if (!allowedRoles.some(role => role === actorRole)) {
      throw new UnauthorizedAccessError('Your role cannot perform this supplier onboarding action.')
    }

    const actor = await this.actorRoleResolver.resolveAsync(actorUserId, actorRole)
    if (actor === null) {
      throw new UnauthorizedAccessError(
        'The authenticated user is inactive or their role context is no longer valid.')
    }
  }

  private async loadAsync(id: number): Promise<SupplierOnboardingResponseDto> {
    const [row] = await requestQuery(this.db).where(eq(supplierOnboardingRequests.id, id)).limit(1)
    if (!row) throw new InvalidOperationError('Sequence contains no elements')
    return toDto(row)
  }
}

/** Include(SubmittedByUser).Include(ReviewedByUser) */
function requestQuery(executor: DbExecutor) {
  return executor
    .select({
      request: supplierOnboardingRequests,
      submittedByName: submitter.fullName,
      reviewedByName: reviewer.fullName,
    })
    .from(supplierOnboardingRequests)
    .innerJoin(submitter, eq(supplierOnboardingRequests.submittedByUserId, submitter.id))
    .leftJoin(reviewer, eq(supplierOnboardingRequests.reviewedByUserId, reviewer.id))
}

function toDto({ request, submittedByName, reviewedByName }: RequestWithNames): SupplierOnboardingResponseDto {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    name: request.name,
    contactPerson: request.contactPerson,
    phoneNumber: request.phoneNumber,
    email: request.email,
    kraPin: request.kraPin,
    mpesaNumber: request.mpesaNumber,
    category: request.category,
    status: request.status,
    submittedByUserId: request.submittedByUserId,
    submittedByName,
    submittedAt: request.submittedAt,
    reviewedByUserId: request.reviewedByUserId,
    reviewedByName,
    reviewedAt: request.reviewedAt,
    reviewNotes: request.reviewNotes,
    approvedSupplierId: request.approvedSupplierId,
  }
}
