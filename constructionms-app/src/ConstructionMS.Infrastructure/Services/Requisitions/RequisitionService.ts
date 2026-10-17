import { and, count, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ArgumentError, ArgumentOutOfRangeError, InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import { SegregationOfDutiesChecker } from '@/ConstructionMS.Application/Common/SegregationOfDutiesChecker'
import type { CreateRequisitionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/CreateRequisitionRequestDto'
import type { RequisitionResponseDto } from '@/ConstructionMS.Application/DTOs/Requisitions/RequisitionResponseDto'
import type { UpdateRequisitionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/UpdateRequisitionRequestDto'
import type { IRequisitionService } from '@/ConstructionMS.Application/Services/Requisitions/IRequisitionService'
import { InputNormalizer } from '../../Common/InputNormalizer'
import type { AppDbContext } from '../../Data/AppDbContext'
import { materials, projects, requisitions, users } from '../../Data/schema'

const PendingStatus = 'Pending'
const FilterStatuses = [PendingStatus, 'Approved', 'Rejected']

const requestedByUsers = alias(users, 'RequestedByUser')
const approvedByUsers = alias(users, 'ApprovedByUser')

/** Persists requisitions and enforces requester/approver separation. */
export class RequisitionService implements IRequisitionService {
  constructor(private readonly db: AppDbContext) {}

  private baseQuery() {
    return this.db
      .select({
        r: requisitions,
        projectName: projects.name,
        materialName: materials.name,
        materialUnit: materials.unit,
        requestedByUserName: requestedByUsers.fullName,
        approvedByUserName: approvedByUsers.fullName,
      })
      .from(requisitions)
      .leftJoin(projects, eq(projects.id, requisitions.projectId))
      .leftJoin(materials, eq(materials.id, requisitions.materialId))
      .leftJoin(requestedByUsers, eq(requestedByUsers.id, requisitions.requestedByUserId))
      .leftJoin(approvedByUsers, eq(approvedByUsers.id, requisitions.approvedByUserId))
  }

  async getAllAsync(
    page: number,
    pageSize: number,
    status: string | null = null,
    projectId: number | null = null,
  ): Promise<PaginatedResult<RequisitionResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    const conditions = []

    if (status !== null && status.trim() !== '') {
      const normalizedStatus = FilterStatuses.find(allowed => allowed.toUpperCase() === status.trim().toUpperCase())

      if (normalizedStatus === undefined) {
        throw new ArgumentError('The requisition status filter is invalid.', 'status')
      }

      conditions.push(eq(requisitions.status, normalizedStatus))
    }

    if (projectId !== null && projectId <= 0) {
      throw new ArgumentOutOfRangeError('projectId', 'The project ID must be greater than zero.')
    }

    if (projectId !== null) {
      conditions.push(eq(requisitions.projectId, projectId))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(requisitions).where(where)

    const rows = await this.baseQuery()
      .where(where)
      .orderBy(desc(requisitions.createdAt), desc(requisitions.id)) // newest first for operations teams
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: rows.map(toDto),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number): Promise<RequisitionResponseDto | null> {
    const [row] = await this.baseQuery().where(eq(requisitions.id, id)).limit(1)
    return row ? toDto(row) : null
  }

  async createAsync(dto: CreateRequisitionRequestDto): Promise<RequisitionResponseDto> {
    InputNormalizer.positiveInt(dto.projectId, 'ProjectId')
    InputNormalizer.positiveInt(dto.materialId, 'MaterialId')
    InputNormalizer.positiveInt(dto.requestedByUserId, 'RequestedByUserId')

    const [project] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, dto.projectId)).limit(1)
    if (!project) {
      throw new ArgumentError('The selected project does not exist.', 'ProjectId')
    }

    const [material] = await this.db.select({ id: materials.id }).from(materials).where(eq(materials.id, dto.materialId)).limit(1)
    if (!material) {
      throw new ArgumentError('The selected material does not exist.', 'MaterialId')
    }

    const [requester] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, dto.requestedByUserId), eq(users.isActive, true)))
      .limit(1)
    if (!requester) {
      throw new ArgumentError('The requester does not exist or is inactive.', 'RequestedByUserId')
    }

    const now = new Date()
    const [requisition] = await this.db
      .insert(requisitions)
      .values({
        projectId: dto.projectId,
        materialId: dto.materialId,
        quantity: InputNormalizer.positive(dto.quantity, 'Quantity', 18, 3),
        requestedByUserId: dto.requestedByUserId,
        status: PendingStatus,
        notes: InputNormalizer.optionalText(dto.notes, 'Notes', 1_000),
        createdAt: now,
        // Columns added by the v1 workflow; the legacy service left them at the entity defaults.
        neededByDate: '0001-01-01',
        purpose: '',
        updatedAt: now,
        workflowRevision: 0,
        costCodeId: 0,
        requestType: 'SiteUse', // RequisitionTypes.SiteUse (entity default)
      })
      .returning({ id: requisitions.id })

    return (await this.getByIdAsync(requisition!.id))
      ?? (() => { throw new InvalidOperationError('Requisition was saved but could not be retrieved.') })()
  }

  async updateAsync(
    id: number,
    dto: UpdateRequisitionRequestDto,
  ): Promise<{ dto: RequisitionResponseDto | null; error: string | null }> {
    const [req] = await this.db
      .select({ status: requisitions.status })
      .from(requisitions)
      .where(eq(requisitions.id, id))
      .limit(1)

    if (!req) return { dto: null, error: null }

    if (req.status !== PendingStatus) {
      return { dto: null, error: `Only Pending requisitions can be edited. Current status: "${req.status}".` }
    }

    const quantity = InputNormalizer.positive(dto.quantity, 'Quantity', 18, 3)
    const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)

    const updated = await this.db
      .update(requisitions)
      .set({ quantity, notes })
      .where(and(eq(requisitions.id, id), eq(requisitions.status, PendingStatus)))
      .returning({ id: requisitions.id })

    if (updated.length === 0) {
      return { dto: null, error: 'The requisition was actioned by another user. Refresh and try again.' }
    }

    return { dto: await this.getByIdAsync(id), error: null }
  }

  async approveAsync(id: number, approvedByUserId: number) {
    return this.actionRequisitionAsync(id, approvedByUserId, 'Approved')
  }

  async rejectAsync(id: number, approvedByUserId: number) {
    return this.actionRequisitionAsync(id, approvedByUserId, 'Rejected')
  }

  private async actionRequisitionAsync(
    id: number,
    approvedByUserId: number,
    newStatus: string,
  ): Promise<{ dto: RequisitionResponseDto | null; error: string | null }> {
    const [req] = await this.db.select().from(requisitions).where(eq(requisitions.id, id)).limit(1)

    if (!req) return { dto: null, error: null }

    if (req.status !== PendingStatus) {
      return { dto: null, error: `Only Pending requisitions can be actioned. Current status: "${req.status}".` }
    }

    InputNormalizer.positiveInt(approvedByUserId, 'approvedByUserId')

    const [approver] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, approvedByUserId), eq(users.isActive, true)))
      .limit(1)

    if (!approver) {
      return { dto: null, error: 'The selected approver does not exist or is inactive.' }
    }

    if (SegregationOfDutiesChecker.isSameUser(req.requestedByUserId, approvedByUserId)) {
      return { dto: null, error: SegregationOfDutiesChecker.getViolationMessage('requester', 'approver') }
    }

    const actionedAt = new Date()
    const updated = await this.db
      .update(requisitions)
      .set({ status: newStatus, approvedByUserId, approvedAt: actionedAt })
      .where(and(eq(requisitions.id, id), eq(requisitions.status, PendingStatus)))
      .returning({ id: requisitions.id })

    if (updated.length === 0) {
      return { dto: null, error: 'The requisition was actioned by another user. Refresh and try again.' }
    }

    return { dto: await this.getByIdAsync(id), error: null }
  }
}

function toDto(row: {
  r: typeof requisitions.$inferSelect
  projectName: string | null
  materialName: string | null
  materialUnit: string | null
  requestedByUserName: string | null
  approvedByUserName: string | null
}): RequisitionResponseDto {
  const r = row.r
  return {
    id: r.id,
    projectId: r.projectId,
    projectName: row.projectName ?? '',
    materialId: r.materialId,
    materialName: row.materialName ?? '',
    materialUnit: row.materialUnit ?? '',
    quantity: r.quantity,
    requestedByUserId: r.requestedByUserId,
    requestedByUserName: row.requestedByUserName ?? '',
    approvedByUserId: r.approvedByUserId,
    approvedByUserName: row.approvedByUserName,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
  }
}
