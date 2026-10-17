import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, exists, sql, type SQL } from 'drizzle-orm'
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
  CreateMaterialCatalogRequestDto,
  MaterialCatalogRequestResponseDto,
  ReviewMaterialCatalogRequestDto,
} from '@/ConstructionMS.Application/DTOs/Materials/MaterialCatalogRequestDtos'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IMaterialCatalogRequestService } from '@/ConstructionMS.Application/Services/Materials/IMaterialCatalogRequestService'
import { MaterialCatalogRequestStatuses } from '@/ConstructionMS.Domain/Entities/MaterialCatalogRequest'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import { materialCatalogRequests, materials, projects, userProjectAssignments, users } from '../../Data/schema'
import { ControlEventWriter } from '../ControlEventWriter'

type CatalogRequestRow = typeof materialCatalogRequests.$inferSelect

const ForemanRole = 'Foreman'
const ProcurementRole = 'Procurement Officer'
const ReadRoles = [ForemanRole, ProcurementRole, 'CEO', 'Auditor']
const AllowedStatuses = [
  MaterialCatalogRequestStatuses.Pending,
  MaterialCatalogRequestStatuses.Approved,
  MaterialCatalogRequestStatuses.Rejected,
]

const submitter = alias(users, 'submitter')
const reviewer = alias(users, 'reviewer')

interface RequestWithNames {
  request: CatalogRequestRow
  projectName: string
  submittedByName: string
  reviewedByName: string | null
}

export class MaterialCatalogRequestService implements IMaterialCatalogRequestService {
  private readonly events: ControlEventWriter

  constructor(
    private readonly db: AppDbContext,
    private readonly actorRoleResolver: IActorRoleResolver,
  ) {
    this.events = new ControlEventWriter(db)
  }

  async getAllAsync(
    page: number,
    pageSize: number,
    status: string | null,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaginatedResult<MaterialCatalogRequestResponseDto>> {
    const actor = await this.requireRoleAsync(actorUserId, actorRole, ReadRoles)
    const pagination = Pagination.normalize(page, pageSize)
    const normalizedStatus = normalizeStatus(status)

    const conditions: (SQL | undefined)[] = []
    if (actor.effectiveRole === ForemanRole) {
      conditions.push(eq(materialCatalogRequests.submittedByUserId, actor.userId))
    } else if (actor.effectiveRole === ProcurementRole && !actor.canSwitchRoles) {
      conditions.push(exists(
        this.db
          .select({ one: sql`1` })
          .from(userProjectAssignments)
          .where(and(
            eq(userProjectAssignments.userId, actor.userId),
            eq(userProjectAssignments.projectId, materialCatalogRequests.projectId),
            eq(userProjectAssignments.isActive, true)))))
    }

    if (normalizedStatus !== null) {
      conditions.push(eq(materialCatalogRequests.status, normalizedStatus))
    }
    const filter = and(...conditions)

    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(materialCatalogRequests)
      .where(filter)
    const rows = await requestQuery(this.db)
      .where(filter)
      .orderBy(
        sql`CASE WHEN ${materialCatalogRequests.status} = ${MaterialCatalogRequestStatuses.Pending} THEN 0 ELSE 1 END`,
        desc(materialCatalogRequests.submittedAt),
        desc(materialCatalogRequests.id))
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
    request: CreateMaterialCatalogRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialCatalogRequestResponseDto> {
    const actor = await this.requireRoleAsync(actorUserId, actorRole, [ForemanRole])
    const projectId = InputNormalizer.positiveInt(request.projectId, 'ProjectId')
    const name = InputNormalizer.requiredText(request.name, 'Name', 2, 150)
    const category = InputNormalizer.optionalText(request.category, 'Category', 100)
    const unit = InputNormalizer.requiredText(request.unit, 'Unit', 1, 30)
    const purpose = InputNormalizer.requiredText(request.purpose, 'Purpose', 3, 500)
    const nameKey = normalizeIdentity(name)
    const unitKey = normalizeIdentity(unit)

    const id = await this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: projects.status })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
      if (!project) {
        throw new ArgumentError('The selected project does not exist.', 'ProjectId')
      }

      if (project.status !== 'Active') {
        throw new InvalidOperationError('The selected project is not active.')
      }

      const [assignment] = await tx
        .select({ id: userProjectAssignments.id })
        .from(userProjectAssignments)
        .where(and(
          eq(userProjectAssignments.userId, actor.userId),
          eq(userProjectAssignments.projectId, projectId),
          eq(userProjectAssignments.isActive, true)))
        .limit(1)
      if (!assignment) {
        throw new UnauthorizedAccessError('You are not assigned to the selected project.')
      }

      const [pending] = await tx
        .select({ id: materialCatalogRequests.id })
        .from(materialCatalogRequests)
        .where(and(
          eq(materialCatalogRequests.status, MaterialCatalogRequestStatuses.Pending),
          eq(materialCatalogRequests.normalizedName, nameKey),
          eq(materialCatalogRequests.normalizedUnit, unitKey)))
        .limit(1)
      if (pending) {
        throw new InvalidOperationError('That material already has a request awaiting review.')
      }

      const now = new Date()
      const stamp = now.toISOString().slice(2, 19).replace(/\D/g, '')
      const [catalogRequest] = await tx
        .insert(materialCatalogRequests)
        .values({
          requestNumber: `MCR-${stamp}-${randomUUID().replace(/-/g, '')}`.slice(0, 28).toUpperCase(),
          projectId,
          name,
          category,
          unit,
          purpose,
          status: MaterialCatalogRequestStatuses.Pending,
          submittedByUserId: actor.userId,
          submittedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `material-catalog:${catalogRequest!.id}`,
        requisitionId: null,
        projectId,
        entityType: 'MaterialCatalogRequest',
        entityId: catalogRequest!.id,
        referenceNumber: catalogRequest!.requestNumber,
        eventType: 'MaterialCatalogRequested',
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        details: {
          Name: catalogRequest!.name,
          Category: catalogRequest!.category,
          Unit: catalogRequest!.unit,
          Purpose: catalogRequest!.purpose,
        },
        occurredAt: now,
      }, tx)
      return catalogRequest!.id
    }, { isolationLevel: IsolationLevel.Serializable })

    return await this.loadAsync(id)
  }

  async reviewAsync(
    requestId: number,
    request: ReviewMaterialCatalogRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialCatalogRequestResponseDto> {
    InputNormalizer.positiveInt(requestId, 'requestId')
    const actor = await this.requireRoleAsync(actorUserId, actorRole, [ProcurementRole])
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)

    const id = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM "MaterialCatalogRequests" WHERE "Id" = ${requestId} FOR UPDATE`)
      const [catalogRequest] = await tx
        .select()
        .from(materialCatalogRequests)
        .where(eq(materialCatalogRequests.id, requestId))
        .limit(1)
      if (!catalogRequest) {
        throw new KeyNotFoundError('The material catalog request was not found.')
      }

      if (catalogRequest.status !== MaterialCatalogRequestStatuses.Pending) {
        throw new InvalidOperationError('This material catalog request already has a final decision.')
      }

      if (catalogRequest.submittedByUserId === actor.userId) {
        throw new UnauthorizedAccessError('The requester cannot review the same material.')
      }

      if (!actor.canSwitchRoles) {
        const [assignment] = await tx
          .select({ id: userProjectAssignments.id })
          .from(userProjectAssignments)
          .where(and(
            eq(userProjectAssignments.userId, actor.userId),
            eq(userProjectAssignments.projectId, catalogRequest.projectId),
            eq(userProjectAssignments.isActive, true)))
          .limit(1)
        if (!assignment) {
          throw new UnauthorizedAccessError('You are not assigned to this project.')
        }
      }

      const now = new Date()
      let approvedMaterialId: number | null = null
      let linkedExisting = false
      if (request.approve) {
        const nameKey = normalizeIdentity(catalogRequest.name)
        const unitKey = normalizeIdentity(catalogRequest.unit)
        const [existing] = await tx
          .select({ id: materials.id })
          .from(materials)
          .where(and(eq(materials.normalizedName, nameKey), eq(materials.normalizedUnit, unitKey)))
          .limit(1)
        linkedExisting = existing !== undefined
        approvedMaterialId = existing?.id ?? null

        if (!existing) {
          const [created] = await tx
            .insert(materials)
            .values({
              name: catalogRequest.name,
              category: catalogRequest.category,
              unit: catalogRequest.unit,
              standardPrice: 0,
              reorderLevel: 0,
              requiresTechnicalAcceptance: true,
              createdAt: now,
            })
            .returning({ id: materials.id })
          approvedMaterialId = created!.id
        }
      }

      await tx
        .update(materialCatalogRequests)
        .set({
          status: request.approve ? MaterialCatalogRequestStatuses.Approved : MaterialCatalogRequestStatuses.Rejected,
          reviewedByUserId: actor.userId,
          reviewedAt: now,
          reviewNotes: notes,
          approvedMaterialId,
        })
        .where(eq(materialCatalogRequests.id, catalogRequest.id))
      await this.events.appendAsync({
        chainKey: `material-catalog:${catalogRequest.id}`,
        requisitionId: null,
        projectId: catalogRequest.projectId,
        entityType: 'MaterialCatalogRequest',
        entityId: catalogRequest.id,
        referenceNumber: catalogRequest.requestNumber,
        eventType: request.approve ? 'MaterialCatalogApproved' : 'MaterialCatalogRejected',
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        details: {
          Name: catalogRequest.name,
          Unit: catalogRequest.unit,
          ApprovedMaterialId: approvedMaterialId,
          LinkedExisting: request.approve && linkedExisting,
          Notes: notes,
        },
        occurredAt: now,
      }, tx)
      return catalogRequest.id
    }, { isolationLevel: IsolationLevel.Serializable })

    return await this.loadAsync(id)
  }

  private async loadAsync(id: number): Promise<MaterialCatalogRequestResponseDto> {
    const [row] = await requestQuery(this.db).where(eq(materialCatalogRequests.id, id)).limit(1)
    if (!row) throw new InvalidOperationError('Sequence contains no elements')
    return toDto(row)
  }

  private async requireRoleAsync(
    actorUserId: number,
    actorRole: string,
    allowedRoles: readonly string[],
  ): Promise<ActorRoleContext> {
    const actor = await this.actorRoleResolver.resolveAsync(actorUserId, actorRole)
    if (actor === null || !allowedRoles.includes(actor.effectiveRole)) {
      throw new UnauthorizedAccessError('Your role cannot perform this material catalog action.')
    }

    return actor
  }
}

function normalizeStatus(status: string | null): string | null {
  if (status === null || status.trim() === '') return null
  const match = AllowedStatuses.find(candidate => candidate.toLowerCase() === status.trim().toLowerCase())
  if (match === undefined) {
    throw new ArgumentError('Status must be Pending, Approved, or Rejected.', 'status')
  }
  return match
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase()
}

/** Include(Project).Include(SubmittedByUser).Include(ReviewedByUser) */
function requestQuery(executor: DbExecutor) {
  return executor
    .select({
      request: materialCatalogRequests,
      projectName: projects.name,
      submittedByName: submitter.fullName,
      reviewedByName: reviewer.fullName,
    })
    .from(materialCatalogRequests)
    .innerJoin(projects, eq(materialCatalogRequests.projectId, projects.id))
    .innerJoin(submitter, eq(materialCatalogRequests.submittedByUserId, submitter.id))
    .leftJoin(reviewer, eq(materialCatalogRequests.reviewedByUserId, reviewer.id))
}

function toDto({ request, projectName, submittedByName, reviewedByName }: RequestWithNames): MaterialCatalogRequestResponseDto {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    projectId: request.projectId,
    projectName,
    name: request.name,
    category: request.category,
    unit: request.unit,
    purpose: request.purpose,
    status: request.status,
    submittedByUserId: request.submittedByUserId,
    submittedByName,
    submittedAt: request.submittedAt,
    reviewedByUserId: request.reviewedByUserId,
    reviewedByName,
    reviewedAt: request.reviewedAt,
    reviewNotes: request.reviewNotes,
    approvedMaterialId: request.approvedMaterialId,
  }
}
