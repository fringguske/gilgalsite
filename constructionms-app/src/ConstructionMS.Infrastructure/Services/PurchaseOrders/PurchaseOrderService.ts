import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  ArgumentError,
  ArgumentOutOfRangeError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, sum, toNumber } from '@/ConstructionMS.Application/Common/Money'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import { SegregationOfDutiesChecker } from '@/ConstructionMS.Application/Common/SegregationOfDutiesChecker'
import type { CorrectPurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CorrectPurchaseOrderRequestDto'
import type { CreatePurchaseOrderRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/CreatePurchaseOrderRequestDto'
import type { PurchaseOrderActionRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/PurchaseOrderActionRequestDto'
import type {
  PurchaseOrderEventResponseDto,
  PurchaseOrderLineResponseDto,
  PurchaseOrderResponseDto,
} from '@/ConstructionMS.Application/DTOs/PurchaseOrders/PurchaseOrderResponseDto'
import type { WorkflowReasonRequestDto } from '@/ConstructionMS.Application/DTOs/PurchaseOrders/WorkflowReasonRequestDto'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IPurchaseOrderService } from '@/ConstructionMS.Application/Services/PurchaseOrders/IPurchaseOrderService'
import {
  PurchaseOrderWorkflowStates,
  SourcingRoundWorkflowStates,
} from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { omitNullKeys, serializeJson } from '../../Common/SystemTextJson'
import type { AppDbContext, DbExecutor } from '../../Data/AppDbContext'
import {
  materials,
  projects,
  purchaseOrderEvents,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
  sourcingRoundEvents,
  sourcingRounds,
  supplierQuotes,
  suppliers,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { BudgetCommitmentGuard } from '../Finance/BudgetCommitmentGuard'
import { PurchaseWorkflowAuthorization } from './PurchaseWorkflowAuthorization'

type PurchaseOrderRow = typeof purchaseOrders.$inferSelect
type PurchaseOrderLineRow = typeof purchaseOrderLines.$inferSelect

const VisibleRoles = [
  PurchaseWorkflowAuthorization.ProcurementOfficer,
  PurchaseWorkflowAuthorization.Supervisor,
  PurchaseWorkflowAuthorization.Storekeeper,
  PurchaseWorkflowAuthorization.FinanceOfficer,
  PurchaseWorkflowAuthorization.ChiefExecutive,
  PurchaseWorkflowAuthorization.Auditor,
]

const FilterStatuses = [...PurchaseOrderWorkflowStates.All]
const LiveStatuses = [
  PurchaseOrderWorkflowStates.Draft,
  PurchaseOrderWorkflowStates.Submitted,
  PurchaseOrderWorkflowStates.Approved,
  PurchaseOrderWorkflowStates.Issued,
]

const createdByUser = alias(users, 'created_by_user')
const approvedByUser = alias(users, 'approved_by_user')
const issuedByUser = alias(users, 'issued_by_user')
const rejectedByUser = alias(users, 'rejected_by_user')
const cancelledByUser = alias(users, 'cancelled_by_user')

/** GetWorkflowOrderAsync(): the order with project, supplier, quote (+ round) and lines. */
interface WorkflowOrder {
  order: PurchaseOrderRow
  projectLocation: string | null
  supplierIsBlacklisted: boolean
  quoteValidUntil: string | null
  sourcingRoundId: number
  sourcingRoundStatus: string
  lines: PurchaseOrderLineRow[]
}

/** Controls PO correction, independent decision and issuance with immutable events. */
export class PurchaseOrderService implements IPurchaseOrderService {
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
  ): Promise<PaginatedResult<PurchaseOrderResponseDto>> {
    const actor = await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, ...VisibleRoles)
    if (projectId !== null && projectId <= 0) {
      throw new ArgumentOutOfRangeError('projectId', 'The project ID must be greater than zero.')
    }

    const pagination = Pagination.normalize(page, pageSize)
    const normalizedStatus = normalizeStatus(status)
    const filter = and(
      ...this.readScope(actorUserId, actorRole, actor.canSwitchRoles),
      projectId !== null ? eq(purchaseOrders.projectId, projectId) : undefined,
      normalizedStatus !== null ? eq(purchaseOrders.status, normalizedStatus) : undefined)

    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(purchaseOrders)
      .where(filter)
    const orders = await loadOrdersAsync(this.db, filter, {
      orderBy: [desc(purchaseOrders.createdAt), desc(purchaseOrders.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })

    return createPaginatedResult({
      items: orders.map(order => toDto(order, actorRole)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto | null> {
    const actor = await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, ...VisibleRoles)
    const [order] = await loadOrdersAsync(
      this.db,
      and(...this.readScope(actorUserId, actorRole, actor.canSwitchRoles), eq(purchaseOrders.id, id)),
      { limit: 1 })
    return order === undefined ? null : toDto(order, actorRole)
  }

  async createAsync(
    dto: CreatePurchaseOrderRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    InputNormalizer.positiveInt(dto.requisitionId, 'RequisitionId')
    InputNormalizer.positiveInt(dto.supplierQuoteId, 'SupplierQuoteId')
    const deliveryDate = requireCurrentOrFutureDate(dto.expectedDeliveryDate)

    const [quote] = await this.db
      .select({
        quote: supplierQuotes,
        supplierIsBlacklisted: suppliers.isBlacklisted,
        roundStatus: sourcingRounds.status,
        requisition: requisitions,
        projectLocation: projects.location,
        materialRequiresTechnicalAcceptance: materials.requiresTechnicalAcceptance,
      })
      .from(supplierQuotes)
      .innerJoin(suppliers, eq(supplierQuotes.supplierId, suppliers.id))
      .innerJoin(sourcingRounds, eq(supplierQuotes.sourcingRoundId, sourcingRounds.id))
      .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .where(eq(supplierQuotes.id, dto.supplierQuoteId))
      .limit(1)
    if (!quote) {
      throw new KeyNotFoundError(`Supplier quote with ID ${dto.supplierQuoteId} was not found.`)
    }

    const requisition = quote.requisition
    validateQuoteForRequisition(quote, dto.requisitionId)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, requisition.projectId)
    await PurchaseWorkflowAuthorization.requireOperationalProjectAsync(this.db, requisition.projectId)

    const now = new Date()
    const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)
    const deliveryLocation = InputNormalizer.optionalText(dto.deliveryLocation, 'DeliveryLocation', 300)
      ?? quote.projectLocation
    const createdEvent = newEvent(actorUserId, actorRole, 'Created', null, PurchaseOrderWorkflowStates.Draft, notes, now)

    const orderId = await this.db.transaction(async (tx) => {
      await lockSourcingRoundAsync(tx, quote.quote.sourcingRoundId)
      const { status: currentRoundStatus } = single(await tx
        .select({ status: sourcingRounds.status })
        .from(sourcingRounds)
        .where(eq(sourcingRounds.id, quote.quote.sourcingRoundId))
        .limit(2))
      if (currentRoundStatus !== SourcingRoundWorkflowStates.Open) {
        throw new InvalidOperationError('The selected sourcing round is no longer open.')
      }

      if (await hasLivePurchaseOrderAsync(tx, requisition.id)) {
        throw new InvalidOperationError('A live purchase order already exists for this requisition.')
      }

      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          purchaseOrderNumber: generatePurchaseOrderNumber(now),
          projectId: requisition.projectId,
          requisitionId: requisition.id,
          supplierId: quote.quote.supplierId,
          supplierQuoteId: quote.quote.id,
          createdByUserId: actorUserId,
          status: PurchaseOrderWorkflowStates.Draft,
          expectedDeliveryDate: deliveryDate,
          deliveryLocation,
          notes,
          createdAt: now,
        })
        .returning({ id: purchaseOrders.id })
      await tx.insert(purchaseOrderLines).values({
        purchaseOrderId: order!.id,
        requisitionId: requisition.id,
        materialId: requisition.materialId,
        quantity: requisition.quantity,
        unitPrice: quote.quote.unitPrice,
        requiresTechnicalAcceptance: quote.materialRequiresTechnicalAcceptance,
      })
      await tx.insert(purchaseOrderEvents).values({ ...createdEvent, purchaseOrderId: order!.id })
      return order!.id
    })

    return await this.requireVisibleOrderAsync(orderId, actorUserId, actorRole)
  }

  async submitAsync(
    id: number,
    dto: PurchaseOrderActionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    const order = await this.getWorkflowOrderAsync(id)
    await this.requireCreatorAndAssignmentAsync(order, actorUserId, actorRole)

    // New flow: submitting is approving. Procurement awards the sourcing round and commits the budget itself.
    if (order.order.status !== PurchaseOrderWorkflowStates.Draft) {
      throw invalidState(order, PurchaseOrderWorkflowStates.Draft, 'submitted and approved')
    }
    if (order.sourcingRoundStatus !== SourcingRoundWorkflowStates.Open) {
      throw new InvalidOperationError('The source round must be open before this PO can be submitted.')
    }

    ensureSupplierCanProceed(order)
    const now = new Date()
    const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      await this.awardAndApproveAsync(tx, order, PurchaseOrderWorkflowStates.Draft, actorUserId, actorRole, notes, now)
    })

    return await this.requireVisibleOrderAsync(order.order.id, actorUserId, actorRole)
  }

  /** Legacy approval for orders submitted under the old two-step flow; new submissions approve directly. */
  async approveAsync(
    id: number,
    dto: PurchaseOrderActionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await this.validateIndependentDecisionActorAsync(actorUserId, actorRole)
    const order = await this.getWorkflowOrderAsync(id)
    await this.requireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole)
    if (order.order.status !== PurchaseOrderWorkflowStates.Submitted) {
      throw invalidState(order, PurchaseOrderWorkflowStates.Submitted, 'approved')
    }

    if (order.sourcingRoundStatus !== SourcingRoundWorkflowStates.Open) {
      throw new InvalidOperationError('The source round is no longer open for an award.')
    }

    ensureSupplierCanProceed(order)
    const now = new Date()
    const notes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      await this.awardAndApproveAsync(tx, order, PurchaseOrderWorkflowStates.Submitted, actorUserId, actorRole, notes, now)
    })

    return await this.requireVisibleOrderAsync(order.order.id, actorUserId, actorRole)
  }

  async issueAsync(
    id: number,
    dto: PurchaseOrderActionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    const order = await this.getWorkflowOrderAsync(id)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, order.order.projectId)
    await PurchaseWorkflowAuthorization.requireOperationalProjectAsync(this.db, order.order.projectId)
    if (order.sourcingRoundStatus !== SourcingRoundWorkflowStates.Awarded) {
      throw new InvalidOperationError('The sourcing round must be awarded before issuance.')
    }

    ensureSupplierCanProceed(order, true)
    return await this.simpleTransitionAsync(
      order,
      PurchaseOrderWorkflowStates.Approved,
      PurchaseOrderWorkflowStates.Issued,
      'Issued',
      actorUserId,
      actorRole,
      dto.notes)
  }

  async returnToDraftAsync(
    id: number,
    dto: WorkflowReasonRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await this.validateIndependentDecisionActorAsync(actorUserId, actorRole)
    const order = await this.getWorkflowOrderAsync(id)
    await this.requireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole)
    return await this.simpleTransitionAsync(
      order,
      PurchaseOrderWorkflowStates.Submitted,
      PurchaseOrderWorkflowStates.Draft,
      'ReturnedToDraft',
      actorUserId,
      actorRole,
      requireReason(dto.reason))
  }

  async rejectAsync(
    id: number,
    dto: WorkflowReasonRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await this.validateIndependentDecisionActorAsync(actorUserId, actorRole)
    const order = await this.getWorkflowOrderAsync(id)
    await this.requireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole)
    return await this.simpleTransitionAsync(
      order,
      PurchaseOrderWorkflowStates.Submitted,
      PurchaseOrderWorkflowStates.Rejected,
      'Rejected',
      actorUserId,
      actorRole,
      requireReason(dto.reason))
  }

  async correctAsync(
    id: number,
    dto: CorrectPurchaseOrderRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
    const order = await this.getWorkflowOrderAsync(id)
    await this.requireCreatorAndAssignmentAsync(order, actorUserId, actorRole)
    if (order.order.status !== PurchaseOrderWorkflowStates.Draft) {
      throw invalidState(order, PurchaseOrderWorkflowStates.Draft, 'corrected')
    }

    if (order.sourcingRoundStatus !== SourcingRoundWorkflowStates.Open) {
      throw new InvalidOperationError('The source round must be open before correction.')
    }

    const deliveryDate = requireCurrentOrFutureDate(dto.expectedDeliveryDate)
    const reason = requireReason(dto.reason)
    const newLocation = InputNormalizer.optionalText(dto.deliveryLocation, 'DeliveryLocation', 300)
      ?? order.projectLocation
    const newNotes = InputNormalizer.optionalText(dto.notes, 'Notes', 1_000)
    const now = new Date()
    const details = serializeJson({
      Before: {
        ExpectedDeliveryDate: order.order.expectedDeliveryDate,
        DeliveryLocation: order.order.deliveryLocation,
        Notes: order.order.notes,
      },
      After: {
        ExpectedDeliveryDate: deliveryDate,
        DeliveryLocation: newLocation,
        Notes: newNotes,
      },
    })

    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(purchaseOrders)
        .set({ expectedDeliveryDate: deliveryDate, deliveryLocation: newLocation, notes: newNotes })
        .where(and(eq(purchaseOrders.id, order.order.id), eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Draft)))
        .returning({ id: purchaseOrders.id })
      ensureTransitionWon(updated.length, 'The purchase order was actioned by another user.')
      await tx.insert(purchaseOrderEvents).values(newEvent(
        actorUserId,
        actorRole,
        'Corrected',
        PurchaseOrderWorkflowStates.Draft,
        PurchaseOrderWorkflowStates.Draft,
        reason,
        now,
        order.order.id,
        details))
    })

    return await this.requireVisibleOrderAsync(order.order.id, actorUserId, actorRole)
  }

  async cancelAsync(
    id: number,
    dto: WorkflowReasonRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PurchaseOrderResponseDto> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db,
      this.actorRoleResolver,
      actorUserId,
      actorRole,
      PurchaseWorkflowAuthorization.ProcurementOfficer,
      PurchaseWorkflowAuthorization.Supervisor,
      PurchaseWorkflowAuthorization.ChiefExecutive)
    const order = await this.getWorkflowOrderAsync(id)
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, order.order.projectId)

    const status = order.order.status
    const procurementCancellation =
      (status === PurchaseOrderWorkflowStates.Draft
        || status === PurchaseOrderWorkflowStates.Rejected
        // A self-approved order stays cancellable by its creator until it is issued.
        || status === PurchaseOrderWorkflowStates.Approved)
      && PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
      && order.order.createdByUserId === actorUserId
    const independentCancellation =
      (status === PurchaseOrderWorkflowStates.Submitted || status === PurchaseOrderWorkflowStates.Approved)
      && (PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.Supervisor)
        || PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.ChiefExecutive))
      && order.order.createdByUserId !== actorUserId
    if (!procurementCancellation && !independentCancellation) {
      throw new UnauthorizedAccessError(
        'Procurement may cancel its own Draft/Rejected/Approved PO; a legacy Submitted PO requires Supervisor or CEO cancellation.')
    }

    const reason = requireReason(dto.reason)
    const now = new Date()
    await this.db.transaction(async (tx) => {
      const orderUpdated = await tx
        .update(purchaseOrders)
        .set({ status: PurchaseOrderWorkflowStates.Cancelled, cancelledByUserId: actorUserId, cancelledAt: now })
        .where(and(eq(purchaseOrders.id, order.order.id), eq(purchaseOrders.status, status)))
        .returning({ id: purchaseOrders.id })
      ensureTransitionWon(orderUpdated.length, 'The purchase order was actioned by another user.')

      if (status === PurchaseOrderWorkflowStates.Approved) {
        const roundUpdated = await tx
          .update(sourcingRounds)
          .set({ status: SourcingRoundWorkflowStates.Cancelled, closedAt: now })
          .where(and(
            eq(sourcingRounds.id, order.sourcingRoundId),
            eq(sourcingRounds.status, SourcingRoundWorkflowStates.Awarded)))
          .returning({ id: sourcingRounds.id })
        ensureTransitionWon(roundUpdated.length, 'The awarded sourcing round changed concurrently.')
        await tx.insert(sourcingRoundEvents).values(newSourcingEvent(
          order.sourcingRoundId,
          actorUserId,
          actorRole,
          'AwardCancelled',
          SourcingRoundWorkflowStates.Awarded,
          SourcingRoundWorkflowStates.Cancelled,
          `Award cancelled with ${order.order.purchaseOrderNumber}: ${reason}`,
          now))
      }

      await tx.insert(purchaseOrderEvents).values(newEvent(
        actorUserId, actorRole, 'Cancelled', status, PurchaseOrderWorkflowStates.Cancelled, reason, now, order.order.id))
    })

    return await this.requireVisibleOrderAsync(order.order.id, actorUserId, actorRole)
  }

  /** Shared body of SubmitAsync (Draft) and the legacy ApproveAsync (Submitted). */
  private async awardAndApproveAsync(
    tx: DbExecutor,
    order: WorkflowOrder,
    fromStatus: string,
    actorUserId: number,
    actorRole: string,
    notes: string | null,
    now: Date,
  ): Promise<void> {
    await BudgetCommitmentGuard.lockProjectAsync(tx, order.order.projectId)
    await lockSourcingRoundAsync(tx, order.sourcingRoundId)

    const { costCodeId } = single(await tx
      .select({ costCodeId: requisitions.costCodeId })
      .from(requisitions)
      .where(eq(requisitions.id, order.order.requisitionId))
      .limit(2))
    await BudgetCommitmentGuard.ensureAvailableAsync(
      tx,
      order.order.projectId,
      costCodeId,
      sum(order.lines.map(line => dec(line.quantity).times(line.unitPrice))),
      order.order.id)

    const roundUpdated = await tx
      .update(sourcingRounds)
      .set({ status: SourcingRoundWorkflowStates.Awarded, closedAt: now })
      .where(and(eq(sourcingRounds.id, order.sourcingRoundId), eq(sourcingRounds.status, SourcingRoundWorkflowStates.Open)))
      .returning({ id: sourcingRounds.id })
    ensureTransitionWon(roundUpdated.length, 'The source round was actioned by another user.')

    const orderUpdated = await tx
      .update(purchaseOrders)
      .set(fromStatus === PurchaseOrderWorkflowStates.Draft
        ? { status: PurchaseOrderWorkflowStates.Approved, submittedAt: now, approvedByUserId: actorUserId, approvedAt: now }
        : { status: PurchaseOrderWorkflowStates.Approved, approvedByUserId: actorUserId, approvedAt: now })
      .where(and(eq(purchaseOrders.id, order.order.id), eq(purchaseOrders.status, fromStatus)))
      .returning({ id: purchaseOrders.id })
    ensureTransitionWon(orderUpdated.length, 'The purchase order was actioned by another user.')

    await tx.insert(purchaseOrderEvents).values(newEvent(
      actorUserId, actorRole, 'Approved', fromStatus, PurchaseOrderWorkflowStates.Approved, notes, now, order.order.id))
    await tx.insert(sourcingRoundEvents).values(newSourcingEvent(
      order.sourcingRoundId,
      actorUserId,
      actorRole,
      'Awarded',
      SourcingRoundWorkflowStates.Open,
      SourcingRoundWorkflowStates.Awarded,
      `Awarded through ${order.order.purchaseOrderNumber}.`,
      now))
  }

  private readScope(actorUserId: number, actorRole: string, canSwitchRoles: boolean): (SQL | undefined)[] {
    if (PurchaseWorkflowAuthorization.canViewAllProjects(actorRole) || canSwitchRoles) {
      return []
    }

    const conditions: (SQL | undefined)[] = [exists(this.db
      .select({ one: sql`1` })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actorUserId),
        eq(userProjectAssignments.projectId, purchaseOrders.projectId),
        eq(userProjectAssignments.isActive, true))))]

    if (PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.Storekeeper)) {
      conditions.push(eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Issued))
    }

    return conditions
  }

  private async getWorkflowOrderAsync(id: number): Promise<WorkflowOrder> {
    const [row] = await this.db
      .select({
        order: purchaseOrders,
        projectLocation: projects.location,
        supplierIsBlacklisted: suppliers.isBlacklisted,
        quoteValidUntil: supplierQuotes.validUntil,
        sourcingRoundId: supplierQuotes.sourcingRoundId,
        sourcingRoundStatus: sourcingRounds.status,
      })
      .from(purchaseOrders)
      .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .innerJoin(supplierQuotes, eq(purchaseOrders.supplierQuoteId, supplierQuotes.id))
      .innerJoin(sourcingRounds, eq(supplierQuotes.sourcingRoundId, sourcingRounds.id))
      .where(eq(purchaseOrders.id, id))
      .limit(1)
    if (!row) {
      throw new KeyNotFoundError(`Purchase order with ID ${id} was not found.`)
    }

    const lines = await this.db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id))
      .orderBy(asc(purchaseOrderLines.id))
    return { ...row, lines }
  }

  private async requireCreatorAndAssignmentAsync(order: WorkflowOrder, actorUserId: number, actorRole: string): Promise<void> {
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, order.order.projectId)
    if (order.order.createdByUserId !== actorUserId) {
      throw new UnauthorizedAccessError('Only the procurement officer who prepared this PO may change or submit it.')
    }
  }

  private async validateIndependentDecisionActorAsync(actorUserId: number, actorRole: string): Promise<void> {
    await PurchaseWorkflowAuthorization.validateActorAsync(
      this.db,
      this.actorRoleResolver,
      actorUserId,
      actorRole,
      PurchaseWorkflowAuthorization.Supervisor,
      PurchaseWorkflowAuthorization.ChiefExecutive)
  }

  private async requireDecisionScopeAndSeparationAsync(
    order: WorkflowOrder,
    actorUserId: number,
    actorRole: string,
  ): Promise<void> {
    await PurchaseWorkflowAuthorization.requireProjectAssignmentAsync(
      this.db, this.actorRoleResolver, actorUserId, actorRole, order.order.projectId)
    if (SegregationOfDutiesChecker.isSameUser(order.order.createdByUserId, actorUserId)) {
      throw new InvalidOperationError(
        SegregationOfDutiesChecker.getViolationMessage('PO creator', 'PO decision maker'))
    }
  }

  private async simpleTransitionAsync(
    order: WorkflowOrder,
    expectedStatus: string,
    nextStatus: string,
    eventType: string,
    actorUserId: number,
    actorRole: string,
    notes: string | null,
  ): Promise<PurchaseOrderResponseDto> {
    if (order.order.status !== expectedStatus) {
      throw invalidState(order, expectedStatus, eventType.toLowerCase())
    }

    const occurredAt = new Date()
    const normalizedNotes = InputNormalizer.optionalText(notes, 'notes', 1_000)
    await this.db.transaction(async (tx) => {
      let changes: Partial<typeof purchaseOrders.$inferInsert>
      if (nextStatus === PurchaseOrderWorkflowStates.Submitted) {
        changes = { status: nextStatus, submittedAt: occurredAt }
      } else if (nextStatus === PurchaseOrderWorkflowStates.Draft) {
        changes = { status: nextStatus, submittedAt: null }
      } else if (nextStatus === PurchaseOrderWorkflowStates.Rejected) {
        changes = { status: nextStatus, rejectedByUserId: actorUserId, rejectedAt: occurredAt }
      } else if (nextStatus === PurchaseOrderWorkflowStates.Issued) {
        changes = { status: nextStatus, issuedByUserId: actorUserId, issuedAt: occurredAt }
      } else {
        throw new InvalidOperationError(`Unsupported PO transition to ${nextStatus}.`)
      }

      const updated = await tx
        .update(purchaseOrders)
        .set(changes)
        .where(and(eq(purchaseOrders.id, order.order.id), eq(purchaseOrders.status, expectedStatus)))
        .returning({ id: purchaseOrders.id })
      ensureTransitionWon(updated.length, 'The purchase order was actioned by another user.')
      await tx.insert(purchaseOrderEvents).values(newEvent(
        actorUserId, actorRole, eventType, expectedStatus, nextStatus, normalizedNotes, occurredAt, order.order.id))
    })

    return await this.requireVisibleOrderAsync(order.order.id, actorUserId, actorRole)
  }

  private async requireVisibleOrderAsync(id: number, actorUserId: number, actorRole: string): Promise<PurchaseOrderResponseDto> {
    const order = await this.getByIdAsync(id, actorUserId, actorRole)
    if (order === null) {
      throw new InvalidOperationError('The purchase order changed but could not be retrieved.')
    }

    return order
  }
}

interface LoadedOrder {
  order: PurchaseOrderRow
  projectName: string | null
  supplierName: string | null
  createdByUserName: string | null
  approvedByUserName: string | null
  issuedByUserName: string | null
  rejectedByUserName: string | null
  cancelledByUserName: string | null
  lines: { line: PurchaseOrderLineRow; materialName: string | null; materialUnit: string | null }[]
  events: {
    id: number
    eventType: string
    fromStatus: string | null
    toStatus: string
    actorUserId: number
    actorUserName: string | null
    actorRole: string
    notes: string | null
    detailsJson: string | null
    occurredAt: Date
  }[]
}

/** BaseQuery(): the order with project, supplier, every actor, lines (+ material) and events. */
async function loadOrdersAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: { orderBy?: SQL[]; offset?: number; limit?: number },
): Promise<LoadedOrder[]> {
  let query = db
    .select({
      order: purchaseOrders,
      projectName: projects.name,
      supplierName: suppliers.name,
      createdByUserName: createdByUser.fullName,
      approvedByUserName: approvedByUser.fullName,
      issuedByUserName: issuedByUser.fullName,
      rejectedByUserName: rejectedByUser.fullName,
      cancelledByUserName: cancelledByUser.fullName,
    })
    .from(purchaseOrders)
    .leftJoin(projects, eq(purchaseOrders.projectId, projects.id))
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(createdByUser, eq(purchaseOrders.createdByUserId, createdByUser.id))
    .leftJoin(approvedByUser, eq(purchaseOrders.approvedByUserId, approvedByUser.id))
    .leftJoin(issuedByUser, eq(purchaseOrders.issuedByUserId, issuedByUser.id))
    .leftJoin(rejectedByUser, eq(purchaseOrders.rejectedByUserId, rejectedByUser.id))
    .leftJoin(cancelledByUser, eq(purchaseOrders.cancelledByUserId, cancelledByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.order.id)
  const lines = await db
    .select({ line: purchaseOrderLines, materialName: materials.name, materialUnit: materials.unit })
    .from(purchaseOrderLines)
    .leftJoin(materials, eq(purchaseOrderLines.materialId, materials.id))
    .where(inArray(purchaseOrderLines.purchaseOrderId, ids))
    .orderBy(asc(purchaseOrderLines.id))
  const events = await db
    .select({
      purchaseOrderId: purchaseOrderEvents.purchaseOrderId,
      id: purchaseOrderEvents.id,
      eventType: purchaseOrderEvents.eventType,
      fromStatus: purchaseOrderEvents.fromStatus,
      toStatus: purchaseOrderEvents.toStatus,
      actorUserId: purchaseOrderEvents.actorUserId,
      actorUserName: users.fullName,
      actorRole: purchaseOrderEvents.actorRole,
      notes: purchaseOrderEvents.notes,
      detailsJson: purchaseOrderEvents.detailsJson,
      occurredAt: purchaseOrderEvents.occurredAt,
    })
    .from(purchaseOrderEvents)
    .leftJoin(users, eq(purchaseOrderEvents.actorUserId, users.id))
    .where(inArray(purchaseOrderEvents.purchaseOrderId, ids))
    .orderBy(asc(purchaseOrderEvents.occurredAt), asc(purchaseOrderEvents.id))

  return rows.map(row => ({
    ...row,
    lines: lines.filter(item => item.line.purchaseOrderId === row.order.id),
    events: events.filter(item => item.purchaseOrderId === row.order.id),
  }))
}

async function hasLivePurchaseOrderAsync(db: DbExecutor, requisitionId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.requisitionId, requisitionId), inArray(purchaseOrders.status, LiveStatuses)))
    .limit(1)
  return row !== undefined
}

async function lockSourcingRoundAsync(db: DbExecutor, id: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM "SourcingRounds" WHERE "Id" = ${id} FOR UPDATE`)
}

/** LINQ SingleAsync(): exactly one row, otherwise InvalidOperationException. */
function single<T>(rows: T[]): T {
  if (rows.length === 0) throw new InvalidOperationError('Sequence contains no elements')
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0]!
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function validateQuoteForRequisition(
  quote: {
    quote: typeof supplierQuotes.$inferSelect
    supplierIsBlacklisted: boolean
    roundStatus: string
    requisition: typeof requisitions.$inferSelect
  },
  requestedRequisitionId: number,
): void {
  if (quote.requisition.id !== requestedRequisitionId) {
    throw new ArgumentError(
      'The supplier quote does not belong to the selected requisition.',
      'requestedRequisitionId')
  }

  if (quote.requisition.status !== RequisitionWorkflowStates.Approved) {
    throw new InvalidOperationError('A PO can only be created from an approved requisition.')
  }

  if (quote.roundStatus !== SourcingRoundWorkflowStates.Open) {
    throw new InvalidOperationError('The selected sourcing round is no longer open.')
  }

  // ValidateQuoteCommercials
  if (quote.supplierIsBlacklisted) {
    throw new InvalidOperationError('A purchase order cannot use a blacklisted supplier.')
  }

  if (quote.quote.validUntil !== null && quote.quote.validUntil < utcToday()) {
    throw new InvalidOperationError('The selected supplier quote has expired.')
  }

  if (dec(quote.quote.quantityOffered).lt(quote.requisition.quantity)) {
    throw new InvalidOperationError('The selected quote does not cover the requisition quantity.')
  }
}

function ensureSupplierCanProceed(order: WorkflowOrder, allowExpiredQuote = false): void {
  if (order.supplierIsBlacklisted) {
    throw new InvalidOperationError('The supplier is blacklisted; this PO cannot proceed.')
  }

  if (!allowExpiredQuote && order.quoteValidUntil !== null && order.quoteValidUntil < utcToday()) {
    throw new InvalidOperationError('The selected supplier quote has expired.')
  }
}

function requireCurrentOrFutureDate(value: string | null): string {
  if (value === null) {
    throw new ArgumentError('An expected delivery date is required.', 'value')
  }

  if (value < utcToday()) {
    throw new ArgumentError('The expected delivery date cannot be in the past.', 'value')
  }

  return value
}

function requireReason(value: string): string {
  return InputNormalizer.requiredText(value, 'value', 3, 1_000)
}

function invalidState(order: WorkflowOrder, expectedStatus: string, action: string): InvalidOperationError {
  return new InvalidOperationError(
    `Only ${expectedStatus} purchase orders can be ${action}. Current status: ${order.order.status}.`)
}

function ensureTransitionWon(updatedRows: number, message: string): void {
  if (updatedRows === 0) {
    throw new InvalidOperationError(`${message} Refresh and try again.`)
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
  purchaseOrderId = 0,
  detailsJson: string | null = null,
): typeof purchaseOrderEvents.$inferInsert {
  return {
    purchaseOrderId,
    actorUserId,
    actorRole,
    eventType,
    fromStatus,
    toStatus,
    notes: InputNormalizer.optionalText(notes, 'notes', 1_000),
    detailsJson,
    occurredAt,
  }
}

function newSourcingEvent(
  sourcingRoundId: number,
  actorUserId: number,
  actorRole: string,
  eventType: string,
  fromStatus: string,
  toStatus: string,
  notes: string | null,
  occurredAt: Date,
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

/** `$"PO-{now:yyyyMMdd}-{Guid.NewGuid():N}"[..20].ToUpperInvariant()` */
function generatePurchaseOrderNumber(now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `PO-${stamp}-${randomUUID().replace(/-/g, '')}`.slice(0, 20).toUpperCase()
}

function normalizeStatus(status: string | null): string | null {
  if (status === null || status.trim() === '') {
    return null
  }

  const candidate = status.trim().toUpperCase()
  const match = FilterStatuses.find(allowed => allowed.toUpperCase() === candidate)
  if (match === undefined) {
    throw new ArgumentError('The purchase-order status filter is invalid.', 'status')
  }

  return match
}

function toDto(loaded: LoadedOrder, actorRole: string): PurchaseOrderResponseDto {
  const { order } = loaded
  const fullEvidence = PurchaseWorkflowAuthorization.canViewAllProjects(actorRole)
  const storekeeper = PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.Storekeeper)
  const finance = PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.FinanceOfficer)
  const procurement = PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
  const supervisor = PurchaseWorkflowAuthorization.roleEquals(actorRole, PurchaseWorkflowAuthorization.Supervisor)
  const showCommercials = !storekeeper
  const showCreator = fullEvidence || procurement || supervisor || finance
  const showDecisionActors = fullEvidence || finance

  return omitNullKeys<PurchaseOrderResponseDto>({
    id: order.id,
    purchaseOrderNumber: order.purchaseOrderNumber,
    projectId: order.projectId,
    projectName: loaded.projectName ?? '',
    requisitionId: order.requisitionId,
    supplierId: order.supplierId,
    supplierName: loaded.supplierName ?? '',
    supplierQuoteId: showCommercials ? order.supplierQuoteId : null,
    status: order.status,
    totalAmount: showCommercials
      ? toNumber(sum(loaded.lines.map(item => dec(item.line.quantity).times(item.line.unitPrice))))
      : null,
    expectedDeliveryDate: order.expectedDeliveryDate,
    deliveryLocation: order.deliveryLocation,
    notes: showCommercials ? order.notes : null,
    createdByUserId: showCreator ? order.createdByUserId : null,
    createdByUserName: showCreator ? loaded.createdByUserName : null,
    approvedByUserId: showDecisionActors ? order.approvedByUserId : null,
    approvedByUserName: showDecisionActors ? loaded.approvedByUserName : null,
    issuedByUserId: showDecisionActors ? order.issuedByUserId : null,
    issuedByUserName: showDecisionActors ? loaded.issuedByUserName : null,
    rejectedByUserId: showDecisionActors ? order.rejectedByUserId : null,
    rejectedByUserName: showDecisionActors ? loaded.rejectedByUserName : null,
    cancelledByUserId: showDecisionActors ? order.cancelledByUserId : null,
    cancelledByUserName: showDecisionActors ? loaded.cancelledByUserName : null,
    createdAt: storekeeper ? null : order.createdAt,
    submittedAt: storekeeper ? null : order.submittedAt,
    approvedAt: storekeeper ? null : order.approvedAt,
    issuedAt: order.issuedAt,
    rejectedAt: storekeeper ? null : order.rejectedAt,
    cancelledAt: storekeeper ? null : order.cancelledAt,
    lines: loaded.lines.map(({ line, materialName, materialUnit }) => omitNullKeys<PurchaseOrderLineResponseDto>({
      id: line.id,
      requisitionId: line.requisitionId,
      materialId: line.materialId,
      materialName: materialName ?? '',
      materialUnit: materialUnit ?? '',
      quantity: line.quantity,
      requiresTechnicalAcceptance: line.requiresTechnicalAcceptance,
      unitPrice: showCommercials ? line.unitPrice : null,
      lineTotal: showCommercials ? toNumber(dec(line.quantity).times(line.unitPrice)) : null,
    }, ['unitPrice', 'lineTotal'])),
    events: fullEvidence
      ? loaded.events.map(event => omitNullKeys<PurchaseOrderEventResponseDto>({
          id: event.id,
          eventType: event.eventType,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          actorUserId: event.actorUserId,
          actorUserName: event.actorUserName ?? '',
          actorRole: event.actorRole,
          notes: event.notes,
          detailsJson: event.detailsJson,
          occurredAt: event.occurredAt,
        }, ['detailsJson']))
      : [],
  }, [
    'supplierQuoteId', 'totalAmount', 'notes', 'createdByUserId', 'createdByUserName',
    'approvedByUserId', 'approvedByUserName', 'issuedByUserId', 'issuedByUserName',
    'rejectedByUserId', 'rejectedByUserName', 'cancelledByUserId', 'cancelledByUserName',
    'createdAt', 'submittedAt', 'approvedAt', 'issuedAt', 'rejectedAt', 'cancelledAt',
  ])
}
