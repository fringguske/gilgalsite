import { and, asc, count, desc, eq, exists, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import {
  ArgumentError,
  ArgumentOutOfRangeError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, round, toNumber } from '@/ConstructionMS.Application/Common/Money'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreateSourcingRoundRequestDto'
import type { RecordSupplierQuoteRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/RecordSupplierQuoteRequestDto'
import type { ReopenSourcingRoundRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/ReopenSourcingRoundRequestDto'
import type {
  SourcingRoundResponseDto,
  SupplierQuoteResponseDto,
} from '@/ConstructionMS.Application/DTOs/PurchaseOrders/SourcingRoundResponseDto'
import type { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { ISourcingService } from '@/ConstructionMS.Application/Services/PurchaseOrders/ISourcingService'
import {
  PurchaseOrderWorkflowStates,
  SourcingRoundWorkflowStates,
} from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import type { AppDbContext, DbExecutor } from '../../Data/AppDbContext'
import {
  materials,
  projects,
  purchaseOrders,
  requisitions,
  sourcingRoundEvents,
  sourcingRounds,
  supplierQuotes,
  suppliers,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { PurchaseWorkflowAuthorization } from './PurchaseWorkflowAuthorization'

type SourcingRoundRow = typeof sourcingRounds.$inferSelect
type RequisitionRow = typeof requisitions.$inferSelect
type SupplierQuoteRow = typeof supplierQuotes.$inferSelect

const VisibleRoles = [
  PurchaseWorkflowAuthorization.ProcurementOfficer,
  PurchaseWorkflowAuthorization.Supervisor,
  PurchaseWorkflowAuthorization.ChiefExecutive,
  PurchaseWorkflowAuthorization.Auditor,
]

const FilterStatuses = [...SourcingRoundWorkflowStates.All]

interface RoundWithRequisition {
  round: SourcingRoundRow
  requisition: RequisitionRow
}

/** Records comparable supplier quotes and preserves every sourcing decision. */
export class SourcingService implements ISourcingService {
  constructor(
    private readonly db: AppDbContext,
    private readonly actorRoleResolver: IActorRoleResolver,
  ) {}

  async getAllAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    status: string | null = null,
  ): Promise<PaginatedResult<SourcingRoundResponseDto>> {
    const actor = await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, ...VisibleRoles)

    if (projectId !== null && projectId <= 0) {
      throw new ArgumentOutOfRangeError('projectId', 'The project ID must be greater than zero.')
    }

    const pagination = Pagination.normalize(page, pageSize)
    const normalizedStatus = normalizeStatus(status)
    const filter = and(
      this.readScope(actorUserId, actorRole, actor.canSwitchRoles),
      projectId !== null ? eq(requisitions.projectId, projectId) : undefined,
      normalizedStatus !== null ? eq(sourcingRounds.status, normalizedStatus) : undefined)

    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(sourcingRounds)
      .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
      .where(filter)
    const rounds = await loadRoundsAsync(this.db, filter, {
      orderBy: [desc(sourcingRounds.createdAt), desc(sourcingRounds.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    const includeEvents = PurchaseWorkflowAuthorization.canViewAllProjects(actorRole)

    return createPaginatedResult({
      items: rounds.map(item => toDto(item, includeEvents)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto | null> {
    const actor = await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, ...VisibleRoles)

    const [item] = await loadRoundsAsync(
      this.db,
      and(this.readScope(actorUserId, actorRole, actor.canSwitchRoles), eq(sourcingRounds.id, id)),
      { limit: 1 })
    return item === undefined
      ? null
      : toDto(item, PurchaseWorkflowAuthorization.canViewAllProjects(actorRole))
  }

  async createAsync(
    dto: CreateSourcingRoundRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SourcingRoundResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    InputNormalizer.positiveInt(dto.requisitionId, 'RequisitionId')
    validateFutureDeadline(dto.quoteDueAt)

    const [requisition] = await this.db
      .select()
      .from(requisitions)
      .where(eq(requisitions.id, dto.requisitionId))
      .limit(1)
    if (!requisition) {
      throw new KeyNotFoundError(`Requisition with ID ${dto.requisitionId} was not found.`)
    }

    if (requisition.status !== RequisitionWorkflowStates.Approved) {
      throw new InvalidOperationError('Only an approved requisition can enter supplier sourcing.')
    }

    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, requisition.projectId)
    await PurchaseWorkflowAuthorization.requireOperationalProjectAsync(this.db, requisition.projectId)

    if (await hasCurrentRoundAsync(this.db, requisition.id)) {
      throw new InvalidOperationError('This requisition already has an open or awarded sourcing round.')
    }

    const now = new Date()
    const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)

    const roundId = await this.db.transaction(async (tx) => {
      await lockRequisitionAsync(tx, requisition.id)
      if (await hasCurrentRoundAsync(tx, requisition.id)) {
        throw new InvalidOperationError('This requisition already has an open or awarded sourcing round.')
      }

      const [created] = await tx
        .insert(sourcingRounds)
        .values({
          requisitionId: requisition.id,
          createdByUserId: actorUserId,
          status: SourcingRoundWorkflowStates.Open,
          quoteDueAt: dto.quoteDueAt,
          notes,
          createdAt: now,
        })
        .returning({ id: sourcingRounds.id })
      await tx.insert(sourcingRoundEvents).values(newEvent(
        actorUserId, actorRole, 'Created', null, SourcingRoundWorkflowStates.Open, notes, now, created!.id))
      return created!.id
    })

    return await this.requireVisibleRoundAsync(roundId, actorUserId, actorRole)
  }

  async recordQuoteAsync(
    sourcingRoundId: number,
    dto: RecordSupplierQuoteRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierQuoteResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    InputNormalizer.positiveInt(sourcingRoundId, 'sourcingRoundId')
    InputNormalizer.positiveInt(dto.supplierId, 'SupplierId')

    const round = await findRoundWithRequisitionAsync(this.db, sourcingRoundId)
    if (round === null) {
      throw new KeyNotFoundError(`Sourcing round with ID ${sourcingRoundId} was not found.`)
    }

    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, round.requisition.projectId)

    const { quote, supplier } = await this.db.transaction(async (tx) => {
      await lockSourcingRoundAsync(tx, round.round.id)
      const currentRound = single(await tx
        .select({ status: sourcingRounds.status, quoteDueAt: sourcingRounds.quoteDueAt })
        .from(sourcingRounds)
        .where(eq(sourcingRounds.id, round.round.id))
        .limit(2))
      if (currentRound.status !== SourcingRoundWorkflowStates.Open) {
        throw new InvalidOperationError('Quotes can only be recorded while the sourcing round is open.')
      }

      if (currentRound.quoteDueAt !== null && currentRound.quoteDueAt.getTime() < Date.now()) {
        throw new InvalidOperationError("The sourcing round's quote deadline has passed.")
      }

      const [supplierRow] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, dto.supplierId))
        .limit(1)
      if (!supplierRow) {
        throw new KeyNotFoundError(`Supplier with ID ${dto.supplierId} was not found.`)
      }

      if (supplierRow.isBlacklisted) {
        throw new InvalidOperationError('A blacklisted supplier cannot participate in sourcing.')
      }

      const { standardPrice: standardPriceSnapshot } = single(await tx
        .select({ standardPrice: materials.standardPrice })
        .from(materials)
        .where(eq(materials.id, round.requisition.materialId))
        .limit(2))

      const quantity = InputNormalizer.positive(dto.quantityOffered, 'QuantityOffered', 18, 3)
      if (dec(quantity).lt(round.requisition.quantity)) {
        throw new ArgumentError('The offered quantity cannot be less than the requisition quantity.', 'QuantityOffered')
      }

      if (dto.validUntil !== null && dto.validUntil < new Date().toISOString().slice(0, 10)) {
        throw new ArgumentError('The quote validity date cannot be in the past.', 'ValidUntil')
      }

      const reference = InputNormalizer.requiredText(dto.quoteReference, 'QuoteReference', 1, 100)
      const [duplicate] = await tx
        .select({ id: supplierQuotes.id })
        .from(supplierQuotes)
        .where(and(
          eq(supplierQuotes.sourcingRoundId, sourcingRoundId),
          or(eq(supplierQuotes.supplierId, dto.supplierId), eq(supplierQuotes.quoteReference, reference))))
        .limit(1)
      if (duplicate) {
        throw new InvalidOperationError(
          'This supplier or quote reference has already been recorded in the sourcing round.')
      }

      const unitPrice = InputNormalizer.positive(dto.unitPrice, 'UnitPrice', 18, 2)
      const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)
      const [inserted] = await tx
        .insert(supplierQuotes)
        .values({
          sourcingRoundId,
          supplierId: dto.supplierId,
          recordedByUserId: actorUserId,
          quoteReference: reference,
          quantityOffered: quantity,
          unitPrice,
          standardPriceSnapshot,
          validUntil: dto.validUntil,
          notes,
          recordedAt: new Date(),
        })
        .returning()
      return { quote: inserted!, supplier: supplierRow }
    })

    const { fullName: actorName } = single(await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(2))

    return toQuoteDto(quote, supplier.name, actorName)
  }

  async closeAsync(
    id: number,
    dto: WorkflowReasonRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SourcingRoundResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    const round = await this.getWorkflowRoundAsync(id)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, round.requisition.projectId)
    return await this.endRoundAsync(
      round, SourcingRoundWorkflowStates.Closed, 'Closed', requireReason(dto.reason), actorUserId, actorRole)
  }

  async cancelAsync(
    id: number,
    dto: WorkflowReasonRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SourcingRoundResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db,
      this.actorRoleResolver,
      actorUserId,
      actorRole,
      PurchaseWorkflowAuthorization.Supervisor,
      PurchaseWorkflowAuthorization.ChiefExecutive)
    const round = await this.getWorkflowRoundAsync(id)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, round.requisition.projectId)
    return await this.endRoundAsync(
      round, SourcingRoundWorkflowStates.Cancelled, 'Cancelled', requireReason(dto.reason), actorUserId, actorRole)
  }

  async reopenAsync(
    id: number,
    dto: ReopenSourcingRoundRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SourcingRoundResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db,
      this.actorRoleResolver,
      actorUserId,
      actorRole,
      PurchaseWorkflowAuthorization.ProcurementOfficer,
      PurchaseWorkflowAuthorization.Supervisor,
      PurchaseWorkflowAuthorization.ChiefExecutive)
    validateFutureDeadline(dto.quoteDueAt)
    const round = await this.getWorkflowRoundAsync(id)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, round.requisition.projectId)

    const canReopen = round.round.status === SourcingRoundWorkflowStates.Closed
      ? PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
      : round.round.status === SourcingRoundWorkflowStates.Cancelled
        && (PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.Supervisor)
          || PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.ChiefExecutive))
    if (!canReopen) {
      throw new UnauthorizedAccessError(
        'Closed rounds may be reopened by Procurement; cancelled rounds require Supervisor or CEO authority.')
    }

    if (round.requisition.status !== RequisitionWorkflowStates.Approved) {
      throw new InvalidOperationError('The source requisition is no longer approved.')
    }

    await PurchaseWorkflowAuthorization.requireOperationalProjectAsync(this.db, round.requisition.projectId)
    const reason = requireReason(dto.reason)
    const now = new Date()
    const reopenedDeadline = dto.quoteDueAt ?? round.round.quoteDueAt
    if (reopenedDeadline !== null && reopenedDeadline.getTime() <= now.getTime()) {
      throw new ArgumentError(
        'A future quote deadline is required when reopening an expired sourcing round.',
        'QuoteDueAt')
    }

    await this.db.transaction(async (tx) => {
      await lockSourcingRoundAsync(tx, round.round.id)
      const { status: currentStatus } = single(await tx
        .select({ status: sourcingRounds.status })
        .from(sourcingRounds)
        .where(eq(sourcingRounds.id, round.round.id))
        .limit(2))
      if (currentStatus !== round.round.status) {
        throw new InvalidOperationError('The sourcing round was actioned by another user. Refresh and try again.')
      }

      if (await hasCurrentRoundAsync(tx, round.round.requisitionId, round.round.id)) {
        throw new InvalidOperationError('Another open or awarded round now exists for this requisition.')
      }

      if (await hasLivePurchaseOrderAsync(tx, round.round.requisitionId)) {
        throw new InvalidOperationError('A live purchase order already exists for this requisition.')
      }

      const updated = await tx
        .update(sourcingRounds)
        .set({ status: SourcingRoundWorkflowStates.Open, closedAt: null, quoteDueAt: reopenedDeadline })
        .where(and(eq(sourcingRounds.id, round.round.id), eq(sourcingRounds.status, round.round.status)))
        .returning({ id: sourcingRounds.id })
      ensureTransitionWon(updated.length)
      await tx.insert(sourcingRoundEvents).values(newEvent(
        actorUserId,
        actorRole,
        'Reopened',
        round.round.status,
        SourcingRoundWorkflowStates.Open,
        reason,
        now,
        round.round.id))
    })

    return await this.requireVisibleRoundAsync(round.round.id, actorUserId, actorRole)
  }

  private readScope(actorUserId: number, actorRole: string, canSwitchRoles: boolean): SQL | undefined {
    if (PurchaseWorkflowAuthorization.canViewAllProjects(actorRole) || canSwitchRoles) {
      return undefined
    }

    return exists(this.db
      .select({ one: sql`1` })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actorUserId),
        eq(userProjectAssignments.projectId, requisitions.projectId),
        eq(userProjectAssignments.isActive, true))))
  }

  private async getWorkflowRoundAsync(id: number): Promise<RoundWithRequisition> {
    const round = await findRoundWithRequisitionAsync(this.db, id)
    if (round === null) {
      throw new KeyNotFoundError(`Sourcing round with ID ${id} was not found.`)
    }

    return round
  }

  private async endRoundAsync(
    round: RoundWithRequisition,
    nextStatus: string,
    eventType: string,
    reason: string,
    actorUserId: number,
    actorRole: string,
  ): Promise<SourcingRoundResponseDto> {
    const now = new Date()
    await this.db.transaction(async (tx) => {
      await lockSourcingRoundAsync(tx, round.round.id)
      const { status: currentStatus } = single(await tx
        .select({ status: sourcingRounds.status })
        .from(sourcingRounds)
        .where(eq(sourcingRounds.id, round.round.id))
        .limit(2))
      if (currentStatus !== SourcingRoundWorkflowStates.Open) {
        throw new InvalidOperationError('Only an open sourcing round can be closed or cancelled.')
      }

      if (await hasLivePurchaseOrderAsync(tx, round.round.requisitionId)) {
        throw new InvalidOperationError('Cancel or complete the live purchase order before ending this sourcing round.')
      }

      const updated = await tx
        .update(sourcingRounds)
        .set({ status: nextStatus, closedAt: now })
        .where(and(eq(sourcingRounds.id, round.round.id), eq(sourcingRounds.status, SourcingRoundWorkflowStates.Open)))
        .returning({ id: sourcingRounds.id })
      ensureTransitionWon(updated.length)
      await tx.insert(sourcingRoundEvents).values(newEvent(
        actorUserId, actorRole, eventType, SourcingRoundWorkflowStates.Open, nextStatus, reason, now, round.round.id))
    })

    return await this.requireVisibleRoundAsync(round.round.id, actorUserId, actorRole)
  }

  private async requireVisibleRoundAsync(id: number, actorUserId: number, actorRole: string): Promise<SourcingRoundResponseDto> {
    const round = await this.getByIdAsync(id, actorUserId, actorRole)
    if (round === null) {
      throw new InvalidOperationError('The sourcing round changed but could not be retrieved.')
    }

    return round
  }
}

interface LoadedRound {
  round: SourcingRoundRow
  requisition: RequisitionRow
  projectName: string | null
  materialName: string | null
  materialUnit: string | null
  createdByUserName: string | null
  quotes: { quote: SupplierQuoteRow; supplierName: string | null; recordedByUserName: string | null }[]
  events: {
    id: number
    eventType: string
    fromStatus: string | null
    toStatus: string
    actorUserId: number
    actorUserName: string | null
    actorRole: string
    notes: string | null
    occurredAt: Date
  }[]
}

/** BaseQuery(): rounds with requisition (project, material), creator, quotes and events. */
async function loadRoundsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: { orderBy?: SQL[]; offset?: number; limit?: number },
): Promise<LoadedRound[]> {
  let query = db
    .select({
      round: sourcingRounds,
      requisition: requisitions,
      projectName: projects.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      createdByUserName: users.fullName,
    })
    .from(sourcingRounds)
    .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
    .leftJoin(projects, eq(requisitions.projectId, projects.id))
    .leftJoin(materials, eq(requisitions.materialId, materials.id))
    .leftJoin(users, eq(sourcingRounds.createdByUserId, users.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.round.id)
  const quotes = await db
    .select({ quote: supplierQuotes, supplierName: suppliers.name, recordedByUserName: users.fullName })
    .from(supplierQuotes)
    .leftJoin(suppliers, eq(supplierQuotes.supplierId, suppliers.id))
    .leftJoin(users, eq(supplierQuotes.recordedByUserId, users.id))
    .where(inArray(supplierQuotes.sourcingRoundId, ids))
    .orderBy(asc(supplierQuotes.unitPrice), asc(supplierQuotes.id))
  const events = await db
    .select({
      sourcingRoundId: sourcingRoundEvents.sourcingRoundId,
      id: sourcingRoundEvents.id,
      eventType: sourcingRoundEvents.eventType,
      fromStatus: sourcingRoundEvents.fromStatus,
      toStatus: sourcingRoundEvents.toStatus,
      actorUserId: sourcingRoundEvents.actorUserId,
      actorUserName: users.fullName,
      actorRole: sourcingRoundEvents.actorRole,
      notes: sourcingRoundEvents.notes,
      occurredAt: sourcingRoundEvents.occurredAt,
    })
    .from(sourcingRoundEvents)
    .leftJoin(users, eq(sourcingRoundEvents.actorUserId, users.id))
    .where(inArray(sourcingRoundEvents.sourcingRoundId, ids))
    .orderBy(asc(sourcingRoundEvents.occurredAt), asc(sourcingRoundEvents.id))

  return rows.map(row => ({
    ...row,
    quotes: quotes.filter(item => item.quote.sourcingRoundId === row.round.id),
    events: events.filter(item => item.sourcingRoundId === row.round.id),
  }))
}

async function findRoundWithRequisitionAsync(db: DbExecutor, id: number): Promise<RoundWithRequisition | null> {
  const [row] = await db
    .select({ round: sourcingRounds, requisition: requisitions })
    .from(sourcingRounds)
    .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
    .where(eq(sourcingRounds.id, id))
    .limit(1)
  return row ?? null
}

async function lockSourcingRoundAsync(db: DbExecutor, id: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM "SourcingRounds" WHERE "Id" = ${id} FOR UPDATE`)
}

async function lockRequisitionAsync(db: DbExecutor, id: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM "Requisitions" WHERE "Id" = ${id} FOR UPDATE`)
}

async function hasCurrentRoundAsync(db: DbExecutor, requisitionId: number, excludedId = 0): Promise<boolean> {
  const [row] = await db
    .select({ id: sourcingRounds.id })
    .from(sourcingRounds)
    .where(and(
      eq(sourcingRounds.requisitionId, requisitionId),
      ne(sourcingRounds.id, excludedId),
      inArray(sourcingRounds.status, [SourcingRoundWorkflowStates.Open, SourcingRoundWorkflowStates.Awarded])))
    .limit(1)
  return row !== undefined
}

async function hasLivePurchaseOrderAsync(db: DbExecutor, requisitionId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.requisitionId, requisitionId),
      inArray(purchaseOrders.status, [
        PurchaseOrderWorkflowStates.Draft,
        PurchaseOrderWorkflowStates.Submitted,
        PurchaseOrderWorkflowStates.Approved,
        PurchaseOrderWorkflowStates.Issued,
      ])))
    .limit(1)
  return row !== undefined
}

/** LINQ SingleAsync(): exactly one row, otherwise InvalidOperationException. */
function single<T>(rows: T[]): T {
  if (rows.length === 0) throw new InvalidOperationError('Sequence contains no elements')
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0]!
}

function validateFutureDeadline(deadline: Date | null): void {
  if (deadline !== null && deadline.getTime() <= Date.now()) {
    throw new ArgumentError('The quote deadline must be in the future.', 'deadline')
  }
}

function requireReason(value: string): string {
  return InputNormalizer.requiredText(value, 'value', 3, 1_000)
}

function ensureTransitionWon(updatedRows: number): void {
  if (updatedRows === 0) {
    throw new InvalidOperationError('The sourcing round was actioned by another user. Refresh and try again.')
  }
}

function newEvent(
  actorUserId: number,
  actorRole: string,
  eventType: string,
  fromStatus: string | null,
  toStatus: string,
  notes: string | null,
  occurredAt: Date,
  sourcingRoundId: number,
): typeof sourcingRoundEvents.$inferInsert {
  return {
    sourcingRoundId,
    actorUserId,
    actorRole,
    eventType,
    fromStatus,
    toStatus,
    notes: InputNormalizer.optionalText(notes, 'notes', 1_000),
    occurredAt,
  }
}

function normalizeStatus(status: string | null): string | null {
  if (status === null || status.trim() === '') {
    return null
  }

  const candidate = status.trim().toUpperCase()
  const match = FilterStatuses.find(allowed => allowed.toUpperCase() === candidate)
  if (match === undefined) {
    throw new ArgumentError('The sourcing-round status filter is invalid.', 'status')
  }

  return match
}

function toQuoteDto(quote: SupplierQuoteRow, supplierName: string | null, recordedByUserName: string | null): SupplierQuoteResponseDto {
  const dto: SupplierQuoteResponseDto = {
    id: quote.id,
    sourcingRoundId: quote.sourcingRoundId,
    supplierId: quote.supplierId,
    supplierName: supplierName ?? '',
    quoteReference: quote.quoteReference,
    quantityOffered: quote.quantityOffered,
    unitPrice: quote.unitPrice,
    standardPriceSnapshot: quote.standardPriceSnapshot,
    priceVariancePercentage: calculateVariance(quote.unitPrice, quote.standardPriceSnapshot),
    totalPrice: toNumber(dec(quote.quantityOffered).times(quote.unitPrice)),
    validUntil: quote.validUntil,
    recordedByUserId: quote.recordedByUserId,
    recordedByUserName: recordedByUserName ?? '',
    notes: quote.notes,
    recordedAt: quote.recordedAt,
  }
  // [JsonIgnore(Condition = WhenWritingNull)]: the key is omitted when there is no standard price.
  if (dec(quote.standardPriceSnapshot).gt(0)) {
    dto.priceAboveStandard = dec(quote.unitPrice).gt(quote.standardPriceSnapshot)
  }

  return dto
}

function toDto(item: LoadedRound, includeEvents: boolean): SourcingRoundResponseDto {
  return {
    id: item.round.id,
    requisitionId: item.round.requisitionId,
    projectId: item.requisition.projectId,
    projectName: item.projectName ?? '',
    materialId: item.requisition.materialId,
    materialName: item.materialName ?? '',
    materialUnit: item.materialUnit ?? '',
    requestedQuantity: item.requisition.quantity,
    createdByUserId: item.round.createdByUserId,
    createdByUserName: item.createdByUserName ?? '',
    status: item.round.status,
    quoteDueAt: item.round.quoteDueAt,
    notes: item.round.notes,
    createdAt: item.round.createdAt,
    closedAt: item.round.closedAt,
    quotes: item.quotes.map(quote => toQuoteDto(quote.quote, quote.supplierName, quote.recordedByUserName)),
    events: includeEvents
      ? item.events.map(event => ({
          id: event.id,
          eventType: event.eventType,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          actorUserId: event.actorUserId,
          actorUserName: event.actorUserName ?? '',
          actorRole: event.actorRole,
          notes: event.notes,
          occurredAt: event.occurredAt,
        }))
      : [],
  }
}

function calculateVariance(quotedPrice: number, standardPrice: number): number | null {
  return dec(standardPrice).lte(0)
    ? null
    : toNumber(round(dec(quotedPrice).minus(standardPrice).div(standardPrice).times(100), 2))
}
