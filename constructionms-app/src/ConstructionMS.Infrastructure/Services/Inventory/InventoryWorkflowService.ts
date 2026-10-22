import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, exists, gt, inArray, ne, not, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  ArgumentError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { Decimal, dec, sum, toNumber } from '@/ConstructionMS.Application/Common/Money'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  ConfirmMaterialIssueRequestDto,
  CreateStockCountRequestDto,
  CreateStockTransferRequestDto,
  GoodsReceiptResponseDto,
  IssueMaterialRequestDto,
  MaterialIssueResponseDto,
  ReceiveGoodsRequestDto,
  ReceiveStockTransferRequestDto,
  RecordMaterialUsageRequestDto,
  RecordTechnicalAcceptanceRequestDto,
  ResolveStockTransferDisputeRequestDto,
  ReviewStockCountRequestDto,
  StockBalanceResponseDto,
  StockCountResponseDto,
  StockLedgerEntryResponseDto,
  StockTransferResponseDto,
  TechnicalAcceptanceResponseDto,
} from '@/ConstructionMS.Application/DTOs/Inventory/InventoryDtos'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IInventoryWorkflowService } from '@/ConstructionMS.Application/Services/Inventory/IInventoryWorkflowService'
import { CustodyCloseoutStatuses, MaterialReturnStatuses } from '@/ConstructionMS.Domain/Entities/ControlWorkspaceEntities'
import {
  MaterialIssueStatuses,
  StockCountStatuses,
  StockTransferResolutionDispositions,
  StockTransferStatuses,
  TechnicalAcceptanceOutcomes,
} from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionTypes } from '@/ConstructionMS.Domain/Entities/Requisition'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PurchaseOrderInvariant } from '../../Common/PurchaseOrderInvariant'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  goodsReceiptTechnicalAcceptances,
  goodsReceipts,
  materialCustodyCloseouts,
  materialIssues,
  materialReturns,
  materialUsageRecords,
  materials,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
  stockBalances,
  stockCounts,
  stockLedgerEntries,
  stockTransfers,
  suppliers,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { ControlEventWriter } from '../ControlEventWriter'

type GoodsReceiptRow = typeof goodsReceipts.$inferSelect
type MaterialIssueRow = typeof materialIssues.$inferSelect
type StockTransferRow = typeof stockTransfers.$inferSelect
type TechnicalAcceptanceRow = typeof goodsReceiptTechnicalAcceptances.$inferSelect

const Serializable = { isolationLevel: IsolationLevel.Serializable } as const

const fromProject = alias(projects, 'from_project')
const toProject = alias(projects, 'to_project')
const requestedByUser = alias(users, 'requested_by_user')
const dispatchedByUser = alias(users, 'dispatched_by_user')
const receivedByUser = alias(users, 'received_by_user')
const resolvedByUser = alias(users, 'resolved_by_user')
const issuedByUser = alias(users, 'issued_by_user')
const issuedToUser = alias(users, 'issued_to_user')
const countedByUser = alias(users, 'counted_by_user')
const reviewedByUser = alias(users, 'reviewed_by_user')

/** A goods receipt with the navigations used by ToDto / ToTechnicalAcceptanceDto. */
interface LoadedReceipt {
  receipt: GoodsReceiptRow
  purchaseOrderNumber: string
  requisitionId: number
  supplierName: string
  lineQuantity: number
  lineRequiresTechnicalAcceptance: boolean
  projectName: string
  materialName: string
  materialUnit: string
  receivedByName: string
  technicalAcceptances: (TechnicalAcceptanceRow & { engineerName: string })[]
}

interface PageOptions {
  orderBy?: SQL[]
  offset?: number
  limit?: number
}

export class InventoryWorkflowService implements IInventoryWorkflowService {
  private readonly events: ControlEventWriter

  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
  ) {
    this.events = new ControlEventWriter(db)
  }

  async getReceiptsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<PaginatedResult<GoodsReceiptResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Procurement Officer', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      await this.projectScope(actorUserId, actorRole, goodsReceipts.projectId),
      projectId !== null ? eq(goodsReceipts.projectId, projectId) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(goodsReceipts).where(filter))
    const items = await loadReceiptsAsync(this.db, filter, {
      orderBy: [desc(goodsReceipts.receivedAt), desc(goodsReceipts.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items.map(toReceiptDto), total, pagination.page, pagination.pageSize)
  }

  async receiveGoodsAsync(
    request: ReceiveGoodsRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<GoodsReceiptResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    const delivered = InputNormalizer.positive(request.deliveredQuantity, 'DeliveredQuantity', 18, 3)
    const accepted = InputNormalizer.nonNegative(request.acceptedQuantity, 'AcceptedQuantity', 18, 3)
    if (dec(accepted).gt(delivered)) throw new ArgumentError('Accepted quantity cannot exceed delivered quantity.')
    // The Storekeeper only says how many good ones arrived; the recorded condition follows from that.
    const condition = dec(accepted).eq(delivered) ? 'Good' : dec(accepted).eq(0) ? 'Damaged' : 'Mixed'
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const rejected = dec(delivered).minus(accepted)

    const receiptId = await this.db.transaction(async (tx) => {
      const orders = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, request.purchaseOrderId))
        .limit(2)
      const order = singleOrDefault(orders)
      if (order === null) throw new KeyNotFoundError('The purchase order was not found.')
      if (order.status !== PurchaseOrderWorkflowStates.Issued) {
        throw new InvalidOperationError('Goods can be received only against an issued purchase order.')
      }
      if (order.issuedByUserId === actorUserId) {
        throw new UnauthorizedAccessError(
          'The person who issued the purchase order cannot independently receive its delivery.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, order.projectId)
      const lines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, order.id))
        .orderBy(asc(purchaseOrderLines.id))
      const line = PurchaseOrderInvariant.requireSingleLine({ lines })

      // A pending engineering check still reserves the outstanding PO quantity, while a
      // technically rejected receipt releases it so the supplier can deliver a replacement.
      const earlierReceipts = await loadReceiptsWithReviewsAsync(
        tx, and(eq(goodsReceipts.purchaseOrderLineId, line.id), gt(goodsReceipts.acceptedQuantity, 0)))
      const committedBefore = line.requiresTechnicalAcceptance
        ? sum(earlierReceipts
          .filter(item => latestTechnicalAcceptance(item.reviews)?.outcome !== TechnicalAcceptanceOutcomes.Rejected)
          .map(item => item.receipt.acceptedQuantity))
        : sum(earlierReceipts.map(item => item.receipt.acceptedQuantity))
      if (committedBefore.plus(accepted).gt(line.quantity)) {
        throw new InvalidOperationError('The accepted quantity would exceed the outstanding purchase-order quantity.')
      }

      const now = new Date()
      const receiptNumber = reference('GRN', now)
      const [receipt] = await tx
        .insert(goodsReceipts)
        .values({
          receiptNumber,
          purchaseOrderId: order.id,
          purchaseOrderLineId: line.id,
          supplierId: order.supplierId,
          projectId: order.projectId,
          materialId: line.materialId,
          deliveredQuantity: delivered,
          acceptedQuantity: accepted,
          rejectedQuantity: toNumber(rejected),
          condition,
          // The Storekeeper no longer types the supplier's delivery note number. The column must
          // be filled and unique per supplier, so it takes this receipt's own (unique) number.
          deliveryNoteReference: receiptNumber.toUpperCase(),
          evidenceReference: evidence,
          discrepancyNotes: null,
          receivedByUserId: actorUserId,
          receivedAt: now,
        })
        .returning()
      if (dec(accepted).gt(0)) {
        await changeBalanceAsync(tx, order.projectId, line.materialId, dec(accepted), 'Receipt', 'GoodsReceipt',
          receipt!.id, receipt!.receiptNumber, actorUserId, null, now)
      }
      await this.events.appendAsync({
        chainKey: chain(order.requisitionId),
        requisitionId: order.requisitionId,
        projectId: order.projectId,
        entityType: 'GoodsReceipt',
        entityId: receipt!.id,
        referenceNumber: receipt!.receiptNumber,
        eventType: 'GoodsReceived',
        actorUserId,
        actorRole,
        details: { delivered, accepted, rejected: toNumber(rejected), condition },
        occurredAt: now,
      }, tx)
      return receipt!.id
    }, Serializable)

    const [loaded] = await loadReceiptsAsync(this.db, eq(goodsReceipts.id, receiptId), { limit: 1 })
    return toReceiptDto(loaded!)
  }

  async getTechnicalAcceptancesAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    status: string | null = null,
  ): Promise<PaginatedResult<TechnicalAcceptanceResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Engineer', 'Finance Officer', 'CEO', 'Auditor')
    if (projectId !== null && projectId <= 0) throw new ArgumentError('Project ID must be positive.', 'projectId')

    const normalizedStatus = normalizeTechnicalAcceptanceStatus(status)
    const hasReviews = exists(this.db
      .select({ one: sql`1` })
      .from(goodsReceiptTechnicalAcceptances)
      .where(eq(goodsReceiptTechnicalAcceptances.goodsReceiptId, goodsReceipts.id)))
    const latestOutcome = sql`(
      SELECT review."Outcome" FROM "GoodsReceiptTechnicalAcceptances" AS review
      WHERE review."GoodsReceiptId" = ${goodsReceipts.id}
      ORDER BY review."ReviewSequence" DESC
      LIMIT 1)`

    const filter = and(
      eq(purchaseOrderLines.requiresTechnicalAcceptance, true),
      gt(goodsReceipts.acceptedQuantity, 0),
      not(exists(this.db
        .select({ one: sql`1` })
        .from(stockLedgerEntries)
        .where(and(
          eq(stockLedgerEntries.referenceType, 'GoodsReceipt'),
          eq(stockLedgerEntries.referenceId, goodsReceipts.id),
          eq(stockLedgerEntries.movementType, 'Receipt'),
          gt(stockLedgerEntries.quantityDelta, 0))))),
      await this.projectScope(actorUserId, actorRole, goodsReceipts.projectId),
      projectId !== null ? eq(goodsReceipts.projectId, projectId) : undefined,
      normalizedStatus === 'Pending'
        ? not(hasReviews)
        : normalizedStatus === TechnicalAcceptanceOutcomes.Accepted
          ? sql`${latestOutcome} = ${TechnicalAcceptanceOutcomes.Accepted}`
          : normalizedStatus === TechnicalAcceptanceOutcomes.Rejected
            ? sql`${latestOutcome} = ${TechnicalAcceptanceOutcomes.Rejected}`
            : undefined)

    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db
      .select({ value: count() })
      .from(goodsReceipts)
      .innerJoin(purchaseOrderLines, eq(goodsReceipts.purchaseOrderLineId, purchaseOrderLines.id))
      .where(filter))
    const items = await loadReceiptsAsync(this.db, filter, {
      orderBy: [
        sql`CASE WHEN ${hasReviews} THEN 1 ELSE 0 END`,
        desc(goodsReceipts.receivedAt),
        desc(goodsReceipts.id),
      ],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items.map(toTechnicalAcceptanceDto), total, pagination.page, pagination.pageSize)
  }

  async recordTechnicalAcceptanceAsync(
    receiptId: number,
    request: RecordTechnicalAcceptanceRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<TechnicalAcceptanceResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Engineer')
    if (receiptId <= 0) throw new ArgumentError('Goods receipt ID must be positive.', 'receiptId')
    const outcome = normalizeTechnicalAcceptanceOutcome(request.outcome)
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM "GoodsReceipts" WHERE "Id" = ${receiptId} FOR UPDATE`)
      const receipt = singleOrDefault(await loadReceiptsAsync(tx, eq(goodsReceipts.id, receiptId), { limit: 2 }))
      if (receipt === null) throw new KeyNotFoundError('The goods receipt was not found.')
      if (!receipt.lineRequiresTechnicalAcceptance) {
        throw new InvalidOperationError('This purchase-order line does not require engineering technical acceptance.')
      }
      if (dec(receipt.receipt.acceptedQuantity).lte(0)) {
        throw new InvalidOperationError(
          'A receipt with no quantity accepted into Stores does not require engineering technical acceptance.')
      }
      const latestReview = latestTechnicalAcceptance(receipt.technicalAcceptances)
      if (latestReview?.outcome === TechnicalAcceptanceOutcomes.Accepted) {
        throw new InvalidOperationError('This goods receipt already has final engineering technical acceptance.')
      }
      if (receipt.receipt.receivedByUserId === actorUserId) {
        throw new UnauthorizedAccessError(
          'The Storekeeper who received the delivery cannot perform its engineering technical acceptance.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, receipt.receipt.projectId)

      const [alreadyPosted] = await tx
        .select({ id: stockLedgerEntries.id })
        .from(stockLedgerEntries)
        .where(and(
          eq(stockLedgerEntries.referenceType, 'GoodsReceipt'),
          eq(stockLedgerEntries.referenceId, receiptId),
          eq(stockLedgerEntries.movementType, 'Receipt'),
          gt(stockLedgerEntries.quantityDelta, 0)))
        .limit(1)
      if (alreadyPosted) {
        throw new InvalidOperationError(
          'This delivery was already recorded directly into usable stock by the Storekeeper; engineering technical acceptance is no longer required.')
      }

      if (outcome === TechnicalAcceptanceOutcomes.Accepted) {
        const otherReceipts = await loadReceiptsWithReviewsAsync(tx, and(
          eq(goodsReceipts.purchaseOrderLineId, receipt.receipt.purchaseOrderLineId),
          ne(goodsReceipts.id, receipt.receipt.id),
          gt(goodsReceipts.acceptedQuantity, 0)))
        const otherCommitted = sum(otherReceipts
          .filter(item => latestTechnicalAcceptance(item.reviews)?.outcome !== TechnicalAcceptanceOutcomes.Rejected)
          .map(item => item.receipt.acceptedQuantity))
        if (otherCommitted.plus(receipt.receipt.acceptedQuantity).gt(receipt.lineQuantity)) {
          throw new InvalidOperationError(
            'A replacement delivery already reserves this purchase-order quantity, so this rejected receipt cannot now be accepted.')
        }
      }

      const now = new Date()
      const [acceptance] = await tx
        .insert(goodsReceiptTechnicalAcceptances)
        .values({
          goodsReceiptId: receipt.receipt.id,
          reviewSequence: (latestReview?.reviewSequence ?? 0) + 1,
          engineerUserId: actorUserId,
          outcome,
          notes,
          evidenceReference: evidence,
          reviewedAt: now,
        })
        .returning()
      if (outcome === TechnicalAcceptanceOutcomes.Accepted) {
        await changeBalanceAsync(
          tx,
          receipt.receipt.projectId,
          receipt.receipt.materialId,
          dec(receipt.receipt.acceptedQuantity),
          'TechnicalAcceptance',
          'GoodsReceipt',
          receipt.receipt.id,
          receipt.receipt.receiptNumber,
          actorUserId,
          notes,
          now)
      }
      await this.events.appendAsync({
        chainKey: chain(receipt.requisitionId),
        requisitionId: receipt.requisitionId,
        projectId: receipt.receipt.projectId,
        entityType: 'GoodsReceiptTechnicalAcceptance',
        entityId: acceptance!.id,
        referenceNumber: receipt.receipt.receiptNumber,
        eventType: outcome === TechnicalAcceptanceOutcomes.Accepted
          ? 'DeliveryTechnicallyAccepted'
          : 'DeliveryTechnicallyRejected',
        actorUserId,
        actorRole,
        details: {
          receiptNumber: receipt.receipt.receiptNumber,
          materialName: receipt.materialName,
          quantity: receipt.receipt.acceptedQuantity,
          reviewSequence: acceptance!.reviewSequence,
          outcome,
          notes,
          evidenceReference: evidence,
        },
        occurredAt: now,
      }, tx)
    }, Serializable)

    const [loaded] = await loadReceiptsAsync(this.db, eq(goodsReceipts.id, receiptId), { limit: 1 })
    if (!loaded) throw new InvalidOperationError('Sequence contains no elements')
    return toTechnicalAcceptanceDto(loaded)
  }

  async getBalancesAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<PaginatedResult<StockBalanceResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole,
      'Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      await this.projectScope(actorUserId, actorRole, stockBalances.projectId),
      projectId !== null ? eq(stockBalances.projectId, projectId) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(stockBalances).where(filter))
    const items = await this.db
      .select({
        balance: stockBalances,
        projectName: projects.name,
        materialName: materials.name,
        category: materials.category,
        unit: materials.unit,
        reorderLevel: materials.reorderLevel,
      })
      .from(stockBalances)
      .innerJoin(projects, eq(stockBalances.projectId, projects.id))
      .innerJoin(materials, eq(stockBalances.materialId, materials.id))
      .where(filter)
      .orderBy(asc(projects.name), asc(materials.name))
      .offset(pagination.offset)
      .limit(pagination.pageSize)
    return pageOf(items.map(item => ({
      id: item.balance.id,
      projectId: item.balance.projectId,
      projectName: item.projectName,
      materialId: item.balance.materialId,
      materialName: item.materialName,
      category: item.category ?? 'Other',
      unit: item.unit,
      quantityOnHand: item.balance.quantityOnHand,
      reorderLevel: item.reorderLevel,
      updatedAt: item.balance.updatedAt,
    })), total, pagination.page, pagination.pageSize)
  }

  async getLedgerAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    materialId: number | null = null,
  ): Promise<PaginatedResult<StockLedgerEntryResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      await this.projectScope(actorUserId, actorRole, stockLedgerEntries.projectId),
      projectId !== null ? eq(stockLedgerEntries.projectId, projectId) : undefined,
      materialId !== null ? eq(stockLedgerEntries.materialId, materialId) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(stockLedgerEntries).where(filter))
    const items = await this.db
      .select({
        entry: stockLedgerEntries,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        actorName: users.fullName,
      })
      .from(stockLedgerEntries)
      .innerJoin(projects, eq(stockLedgerEntries.projectId, projects.id))
      .innerJoin(materials, eq(stockLedgerEntries.materialId, materials.id))
      .innerJoin(users, eq(stockLedgerEntries.actorUserId, users.id))
      .where(filter)
      .orderBy(desc(stockLedgerEntries.occurredAt), desc(stockLedgerEntries.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)
    return pageOf(items.map(({ entry, ...names }) => ({
      id: entry.id,
      projectId: entry.projectId,
      projectName: names.projectName,
      materialId: entry.materialId,
      materialName: names.materialName,
      unit: names.unit,
      movementType: entry.movementType,
      quantityDelta: entry.quantityDelta,
      balanceAfter: entry.balanceAfter,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      referenceNumber: entry.referenceNumber,
      actorName: names.actorName,
      notes: entry.notes,
      occurredAt: entry.occurredAt,
    })), total, pagination.page, pagination.pageSize)
  }

  async getIssuesAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<PaginatedResult<MaterialIssueResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole,
      'Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Finance Officer', 'CEO', 'Auditor')
    const canVerifyAllProjects = await this.canVerifyAllProjectsAsync(actorUserId)
    const filter = and(
      actorRole !== 'CEO' && actorRole !== 'Auditor' && !canVerifyAllProjects
        ? assignmentExists(this.db, actorUserId, materialIssues.projectId)
        : undefined,
      actorRole === 'Foreman' && !canVerifyAllProjects ? eq(materialIssues.issuedToUserId, actorUserId) : undefined,
      projectId !== null ? eq(materialIssues.projectId, projectId) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(materialIssues).where(filter))
    const items = await loadIssuesAsync(this.db, filter, {
      orderBy: [desc(materialIssues.issuedAt), desc(materialIssues.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items, total, pagination.page, pagination.pageSize)
  }

  async issueMaterialAsync(
    request: IssueMaterialRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialIssueResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    const quantity = InputNormalizer.positive(request.quantity, 'Quantity', 18, 3)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const issueId = await this.db.transaction(async (tx) => {
      const requisition = singleOrDefault(await tx
        .select()
        .from(requisitions)
        .where(eq(requisitions.id, request.requisitionId))
        .limit(2))
      if (requisition === null) throw new KeyNotFoundError('The requisition was not found.')
      if (requisition.status !== RequisitionWorkflowStates.Approved) {
        throw new InvalidOperationError('Materials can be issued only against an approved requisition.')
      }
      if (requisition.requestType !== RequisitionTypes.SiteUse) {
        throw new InvalidOperationError(
          'Bulk store replenishment is received into stock and cannot be issued as one foreman handover.')
      }
      if (requisition.requestedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The requester cannot issue their own materials.')
      }
      if (!dec(quantity).eq(requisition.quantity)) {
        throw new InvalidOperationError(
          'This starter workflow issues the full approved quantity on one voucher; revise the requisition before issue if the required quantity changed.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, requisition.projectId)
      const [existingIssue] = await tx
        .select({ id: materialIssues.id })
        .from(materialIssues)
        .where(eq(materialIssues.requisitionId, requisition.id))
        .limit(1)
      if (existingIssue) throw new InvalidOperationError('This requisition already has a material issue voucher.')
      const balance = await getBalanceAsync(tx, requisition.projectId, requisition.materialId)
      if (balance === null || dec(balance.quantityOnHand).lt(quantity)) {
        throw new InvalidOperationError('The project store does not have enough stock for this issue.')
      }

      const now = new Date()
      const [issue] = await tx
        .insert(materialIssues)
        .values({
          issueNumber: reference('MIV', now),
          requisitionId: requisition.id,
          projectId: requisition.projectId,
          materialId: requisition.materialId,
          quantityIssued: quantity,
          issuedByUserId: actorUserId,
          issuedToUserId: requisition.requestedByUserId,
          status: MaterialIssueStatuses.AwaitingConfirmation,
          notes,
          issuedAt: now,
        })
        .returning()
      await changeBalanceAsync(tx, issue!.projectId, issue!.materialId, dec(quantity).negated(), 'Issue', 'MaterialIssue',
        issue!.id, issue!.issueNumber, actorUserId, notes, now)
      await this.events.appendAsync({
        chainKey: chain(requisition.id),
        requisitionId: requisition.id,
        projectId: issue!.projectId,
        entityType: 'MaterialIssue',
        entityId: issue!.id,
        referenceNumber: issue!.issueNumber,
        eventType: 'MaterialIssued',
        actorUserId,
        actorRole,
        details: { quantity, issuedToUserId: issue!.issuedToUserId },
        occurredAt: now,
      }, tx)
      return issue!.id
    }, Serializable)
    return await this.loadIssueAsync(issueId)
  }

  async confirmIssueAsync(
    id: number,
    request: ConfirmMaterialIssueRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialIssueResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Foreman')
    const received = InputNormalizer.nonNegative(request.receivedQuantity, 'ReceivedQuantity', 18, 3)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      await lockMaterialIssueAsync(tx, id)
      const issue = await findIssueAsync(tx, id)
      if (issue.issuedToUserId !== actorUserId) {
        throw new UnauthorizedAccessError('Only the Foreman named on this issue may confirm it.')
      }
      if (issue.status !== MaterialIssueStatuses.AwaitingConfirmation) {
        if (issue.confirmedByUserId === actorUserId
          && issue.confirmedQuantity !== null
          && dec(issue.confirmedQuantity).eq(received)
          && issue.confirmationNotes === notes) {
          return
        }

        throw new InvalidOperationError('This issue has already been confirmed with different details.')
      }
      if (dec(received).gt(issue.quantityIssued)) {
        throw new ArgumentError('Received quantity cannot exceed issued quantity.')
      }
      const now = new Date()
      const status = dec(received).eq(issue.quantityIssued)
        ? MaterialIssueStatuses.Confirmed
        : MaterialIssueStatuses.Disputed
      await tx
        .update(materialIssues)
        .set({ confirmedByUserId: actorUserId, confirmedQuantity: received, confirmationNotes: notes, confirmedAt: now, status })
        .where(eq(materialIssues.id, issue.id))
      await this.events.appendAsync({
        chainKey: chain(issue.requisitionId),
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialIssue',
        entityId: issue.id,
        referenceNumber: issue.issueNumber,
        eventType: status === MaterialIssueStatuses.Confirmed ? 'MaterialReceiptConfirmed' : 'MaterialReceiptDisputed',
        actorUserId,
        actorRole,
        details: { issued: issue.quantityIssued, received, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadIssueAsync(id)
  }

  async recordUsageAsync(
    id: number,
    request: RecordMaterialUsageRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialIssueResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Foreman')
    const type = InputNormalizer.requiredText(request.usageType, 'UsageType', 1, 20)
    if (type !== 'Used' && type !== 'Wastage') throw new ArgumentError('Usage type must be Used or Wastage.')
    const quantity = InputNormalizer.positive(request.quantity, 'Quantity', 18, 3)
    // The work area, purpose or wastage reason is optional.
    const reason = InputNormalizer.optionalText(request.purposeOrReason, 'PurposeOrReason', 500) ?? ''
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const idempotencyKey = InputNormalizer.requiredText(request.idempotencyKey, 'IdempotencyKey', 8, 100)
    await this.db.transaction(async (tx) => {
      await lockMaterialIssueAsync(tx, id)
      const issue = await findIssueAsync(tx, id)
      if (issue.issuedToUserId !== actorUserId) {
        throw new UnauthorizedAccessError('Only the receiving Foreman may account for these materials.')
      }
      if (issue.status !== MaterialIssueStatuses.Confirmed) {
        throw new InvalidOperationError('Confirm the full material receipt before recording use or wastage.')
      }
      const existing = singleOrDefault(await tx
        .select()
        .from(materialUsageRecords)
        .where(and(eq(materialUsageRecords.materialIssueId, id), eq(materialUsageRecords.idempotencyKey, idempotencyKey)))
        .limit(2))
      if (existing !== null) {
        if (existing.usageType !== type
          || !dec(existing.quantity).eq(quantity)
          || existing.purposeOrReason !== reason
          || existing.evidenceReference !== evidence) {
          throw new InvalidOperationError('That idempotency key is already used for different material-use details.')
        }

        return
      }
      const [openCloseout] = await tx
        .select({ id: materialCustodyCloseouts.id })
        .from(materialCustodyCloseouts)
        .where(and(
          eq(materialCustodyCloseouts.materialIssueId, id),
          ne(materialCustodyCloseouts.status, CustodyCloseoutStatuses.Returned)))
        .limit(1)
      if (openCloseout) {
        throw new InvalidOperationError('Material use cannot change while this custody record is under review or closed.')
      }
      const [pendingReturn] = await tx
        .select({ id: materialReturns.id })
        .from(materialReturns)
        .where(and(eq(materialReturns.materialIssueId, id), eq(materialReturns.status, MaterialReturnStatuses.AwaitingReceipt)))
        .limit(1)
      if (pendingReturn) {
        throw new InvalidOperationError('Wait for Stores to decide the pending material return before recording more use.')
      }
      const [usedOrWasted] = await tx
        .select({ value: sql<string>`COALESCE(SUM(${materialUsageRecords.quantity}), 0)` })
        .from(materialUsageRecords)
        .where(eq(materialUsageRecords.materialIssueId, id))
      const [returned] = await tx
        .select({ value: sql<string>`COALESCE(SUM(COALESCE(${materialReturns.quantityAccepted}, 0)), 0)` })
        .from(materialReturns)
        .where(and(eq(materialReturns.materialIssueId, id), eq(materialReturns.status, MaterialReturnStatuses.Received)))
      const already = dec(usedOrWasted?.value).plus(dec(returned?.value))
      // `already + quantity > issue.ConfirmedQuantity` is false when ConfirmedQuantity is null (lifted comparison).
      if (issue.confirmedQuantity !== null && already.plus(quantity).gt(issue.confirmedQuantity)) {
        throw new InvalidOperationError('This entry would account for more than the confirmed quantity.')
      }
      const now = new Date()
      const [record] = await tx
        .insert(materialUsageRecords)
        .values({
          materialIssueId: id,
          usageType: type,
          quantity,
          purposeOrReason: reason,
          evidenceReference: evidence,
          idempotencyKey,
          recordedByUserId: actorUserId,
          recordedAt: now,
        })
        .returning({ id: materialUsageRecords.id })
      await this.events.appendAsync({
        chainKey: chain(issue.requisitionId),
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialUsage',
        entityId: record!.id,
        referenceNumber: issue.issueNumber,
        eventType: type === 'Used' ? 'MaterialUsed' : 'MaterialWastageRecorded',
        actorUserId,
        actorRole,
        details: { quantity, reason, evidence },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadIssueAsync(id)
  }

  async getTransfersAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaginatedResult<StockTransferResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'CEO', 'Auditor')
    const filter = actorRole !== 'CEO' && actorRole !== 'Auditor' && !await this.canVerifyAllProjectsAsync(actorUserId)
      ? exists(this.db
        .select({ one: sql`1` })
        .from(userProjectAssignments)
        .where(and(
          eq(userProjectAssignments.userId, actorUserId),
          eq(userProjectAssignments.isActive, true),
          or(
            eq(userProjectAssignments.projectId, stockTransfers.fromProjectId),
            eq(userProjectAssignments.projectId, stockTransfers.toProjectId)))))
      : undefined
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(stockTransfers).where(filter))
    const items = await loadTransfersAsync(this.db, filter, {
      orderBy: [desc(stockTransfers.requestedAt), desc(stockTransfers.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items, total, pagination.page, pagination.pageSize)
  }

  async createTransferAsync(
    request: CreateStockTransferRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<StockTransferResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    if (request.fromProjectId === request.toProjectId) {
      throw new ArgumentError('Sending and receiving projects must differ.')
    }
    const quantity = InputNormalizer.positive(request.quantity, 'Quantity', 18, 3)
    const reason = InputNormalizer.requiredText(request.reason, 'Reason', 3, 500)
    const transferId = await this.db.transaction(async (tx) => {
      await this.requireProjectAccessAsync(tx, actorUserId, request.fromProjectId)
      await this.requireProjectAccessAsync(tx, actorUserId, request.toProjectId)
      const [material] = await tx
        .select({ id: materials.id })
        .from(materials)
        .where(eq(materials.id, request.materialId))
        .limit(1)
      if (!material) throw new KeyNotFoundError('The material was not found.')
      const now = new Date()
      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          transferNumber: reference('TRF', now),
          fromProjectId: request.fromProjectId,
          toProjectId: request.toProjectId,
          materialId: request.materialId,
          quantity,
          reason,
          status: StockTransferStatuses.PendingDispatch,
          requestedByUserId: actorUserId,
          requestedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `TRF-${transfer!.id}`,
        requisitionId: null,
        projectId: transfer!.fromProjectId,
        entityType: 'StockTransfer',
        entityId: transfer!.id,
        referenceNumber: transfer!.transferNumber,
        eventType: 'TransferRequested',
        actorUserId,
        actorRole,
        details: { ToProjectId: transfer!.toProjectId, quantity, reason },
        occurredAt: now,
      }, tx)
      return transfer!.id
    }, Serializable)
    return await this.loadTransferAsync(transferId)
  }

  async dispatchTransferAsync(id: number, actorUserId: number, actorRole: string): Promise<StockTransferResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    await this.db.transaction(async (tx) => {
      await lockStockTransferAsync(tx, id)
      const transfer = await findTransferAsync(tx, id)
      if (transfer.status !== StockTransferStatuses.PendingDispatch) {
        throw new InvalidOperationError('Only a pending transfer can be dispatched.')
      }
      if (transfer.requestedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The transfer requester cannot dispatch the same transfer.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, transfer.fromProjectId)
      const balance = await getBalanceAsync(tx, transfer.fromProjectId, transfer.materialId)
      if (balance === null || dec(balance.quantityOnHand).lt(transfer.quantity)) {
        throw new InvalidOperationError('The sending store does not have enough stock.')
      }
      const now = new Date()
      await tx
        .update(stockTransfers)
        .set({ status: StockTransferStatuses.InTransit, dispatchedByUserId: actorUserId, dispatchedAt: now })
        .where(eq(stockTransfers.id, transfer.id))
      await changeBalanceAsync(tx, transfer.fromProjectId, transfer.materialId, dec(transfer.quantity).negated(),
        'TransferOut', 'StockTransfer', transfer.id, transfer.transferNumber, actorUserId, transfer.reason, now)
      await this.events.appendAsync({
        chainKey: `TRF-${transfer.id}`,
        requisitionId: null,
        projectId: transfer.fromProjectId,
        entityType: 'StockTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        eventType: 'TransferDispatched',
        actorUserId,
        actorRole,
        details: { Quantity: transfer.quantity, ToProjectId: transfer.toProjectId },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadTransferAsync(id)
  }

  async receiveTransferAsync(
    id: number,
    request: ReceiveStockTransferRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<StockTransferResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    const quantity = InputNormalizer.nonNegative(request.receivedQuantity, 'ReceivedQuantity', 18, 3)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      await lockStockTransferAsync(tx, id)
      const transfer = await findTransferAsync(tx, id)
      if (transfer.status !== StockTransferStatuses.InTransit) {
        throw new InvalidOperationError('Only an in-transit transfer can be received.')
      }
      if (transfer.dispatchedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('A different Storekeeper must confirm receipt.')
      }
      if (dec(quantity).gt(transfer.quantity)) {
        throw new ArgumentError('Received quantity cannot exceed dispatched quantity.')
      }
      if (!dec(quantity).eq(transfer.quantity) && notes === null) {
        throw new ArgumentError('Explain any transfer variance.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, transfer.toProjectId)
      const now = new Date()
      const status = dec(quantity).eq(transfer.quantity) ? StockTransferStatuses.Received : StockTransferStatuses.Disputed
      await tx
        .update(stockTransfers)
        .set({ receivedByUserId: actorUserId, receivedQuantity: quantity, receiptNotes: notes, receivedAt: now, status })
        .where(eq(stockTransfers.id, transfer.id))
      if (dec(quantity).gt(0)) {
        await changeBalanceAsync(tx, transfer.toProjectId, transfer.materialId, dec(quantity), 'TransferIn',
          'StockTransfer', transfer.id, transfer.transferNumber, actorUserId, notes, now)
      }
      await this.events.appendAsync({
        chainKey: `TRF-${transfer.id}`,
        requisitionId: null,
        projectId: transfer.toProjectId,
        entityType: 'StockTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        eventType: status === StockTransferStatuses.Received ? 'TransferReceived' : 'TransferDisputed',
        actorUserId,
        actorRole,
        details: { dispatched: transfer.quantity, received: quantity, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadTransferAsync(id)
  }

  async resolveTransferDisputeAsync(
    id: number,
    request: ResolveStockTransferDisputeRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<StockTransferResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'CEO')
    if (id <= 0) throw new ArgumentError('Transfer ID must be positive.', 'id')
    const disposition = InputNormalizer.requiredText(request.disposition, 'Disposition', 1, 30)
    if (disposition !== StockTransferResolutionDispositions.AcceptedLoss
      && disposition !== StockTransferResolutionDispositions.RecoveredAtDestination
      && disposition !== StockTransferResolutionDispositions.ReturnedToSource) {
      throw new ArgumentError(
        'Transfer resolution must be accepted loss, recovered at destination, or returned to source.')
    }
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    await this.db.transaction(async (tx) => {
      await lockStockTransferAsync(tx, id)
      const transfer = await findTransferAsync(tx, id)
      if (transfer.status === StockTransferStatuses.Resolved) {
        if (transfer.resolvedByUserId === actorUserId
          && transfer.resolutionDisposition === disposition
          && transfer.resolutionNotes === notes
          && transfer.resolutionEvidenceReference === evidence) {
          return
        }

        throw new InvalidOperationError('This transfer variance is already resolved with different details.')
      }
      if (transfer.status !== StockTransferStatuses.Disputed || transfer.receivedQuantity === null) {
        throw new InvalidOperationError('Only a disputed transfer can be resolved.')
      }
      if (actorUserId === transfer.requestedByUserId
        || actorUserId === transfer.dispatchedByUserId
        || actorUserId === transfer.receivedByUserId) {
        throw new UnauthorizedAccessError('The transfer requester, dispatcher, or receiver cannot resolve its variance.')
      }

      const now = new Date()
      const variance = dec(transfer.quantity).minus(transfer.receivedQuantity)
      if (variance.lte(0)) throw new InvalidOperationError('This transfer has no positive variance to resolve.')
      await tx
        .update(stockTransfers)
        .set({
          status: StockTransferStatuses.Resolved,
          resolvedByUserId: actorUserId,
          resolutionDisposition: disposition,
          resolutionQuantity: toNumber(variance),
          resolutionNotes: notes,
          resolutionEvidenceReference: evidence,
          resolvedAt: now,
        })
        .where(eq(stockTransfers.id, transfer.id))
      if (disposition === StockTransferResolutionDispositions.RecoveredAtDestination) {
        await changeBalanceAsync(tx, transfer.toProjectId, transfer.materialId, variance, 'TransferVarianceRecovered',
          'StockTransfer', transfer.id, transfer.transferNumber, actorUserId, notes, now)
      } else if (disposition === StockTransferResolutionDispositions.ReturnedToSource) {
        await changeBalanceAsync(tx, transfer.fromProjectId, transfer.materialId, variance, 'TransferVarianceReturned',
          'StockTransfer', transfer.id, transfer.transferNumber, actorUserId, notes, now)
      }
      await this.events.appendAsync({
        chainKey: `TRF-${transfer.id}`,
        requisitionId: null,
        projectId: transfer.toProjectId,
        entityType: 'StockTransfer',
        entityId: transfer.id,
        referenceNumber: transfer.transferNumber,
        eventType: 'TransferVarianceResolved',
        actorUserId,
        actorRole,
        details: {
          dispatched: transfer.quantity,
          received: transfer.receivedQuantity,
          variance: toNumber(variance),
          disposition,
          notes,
          evidenceReference: evidence,
        },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadTransferAsync(id)
  }

  async getCountsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaginatedResult<StockCountResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'CEO', 'Auditor')
    const filter = await this.projectScope(actorUserId, actorRole, stockCounts.projectId)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(stockCounts).where(filter))
    const items = await loadCountsAsync(this.db, filter, {
      orderBy: [desc(stockCounts.countedAt), desc(stockCounts.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items, total, pagination.page, pagination.pageSize)
  }

  async createCountAsync(
    request: CreateStockCountRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<StockCountResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    const counted = InputNormalizer.nonNegative(request.countedQuantity, 'CountedQuantity', 18, 3)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000) ?? ''
    const countId = await this.db.transaction(async (tx) => {
      await this.requireProjectAccessAsync(tx, actorUserId, request.projectId)
      const balance = await getBalanceAsync(tx, request.projectId, request.materialId)
      if (balance === null) throw new InvalidOperationError('No system stock exists for this project and material yet.')
      const [pending] = await tx
        .select({ id: stockCounts.id })
        .from(stockCounts)
        .where(and(
          eq(stockCounts.projectId, request.projectId),
          eq(stockCounts.materialId, request.materialId),
          eq(stockCounts.status, StockCountStatuses.AwaitingReview)))
        .limit(1)
      if (pending) throw new InvalidOperationError('An earlier count for this stock is still awaiting review.')
      const now = new Date()
      const [stockCount] = await tx
        .insert(stockCounts)
        .values({
          countNumber: reference('CNT', now),
          projectId: request.projectId,
          materialId: request.materialId,
          systemQuantity: balance.quantityOnHand,
          countedQuantity: counted,
          variance: toNumber(dec(counted).minus(balance.quantityOnHand)),
          notes,
          status: StockCountStatuses.AwaitingReview,
          countedByUserId: actorUserId,
          countedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `CNT-${stockCount!.id}`,
        requisitionId: null,
        projectId: stockCount!.projectId,
        entityType: 'StockCount',
        entityId: stockCount!.id,
        referenceNumber: stockCount!.countNumber,
        eventType: 'StockCountSubmitted',
        actorUserId,
        actorRole,
        details: {
          SystemQuantity: stockCount!.systemQuantity,
          CountedQuantity: stockCount!.countedQuantity,
          Variance: stockCount!.variance,
        },
        occurredAt: now,
      }, tx)
      return stockCount!.id
    }, Serializable)
    return await this.loadCountAsync(countId)
  }

  async reviewCountAsync(
    id: number,
    request: ReviewStockCountRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<StockCountResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      const stockCount = singleOrDefault(await tx.select().from(stockCounts).where(eq(stockCounts.id, id)).limit(2))
      if (stockCount === null) throw new KeyNotFoundError('The stock count was not found.')
      if (stockCount.status !== StockCountStatuses.AwaitingReview) {
        throw new InvalidOperationError('This stock count has already been reviewed.')
      }
      if (stockCount.countedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The counter cannot review their own stock count.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, stockCount.projectId)
      const balance = await getBalanceAsync(tx, stockCount.projectId, stockCount.materialId)
      if (balance === null) throw new InvalidOperationError('The stock balance no longer exists.')
      if (!dec(balance.quantityOnHand).eq(stockCount.systemQuantity)) {
        throw new InvalidOperationError('Stock moved after this count. Reject it and perform a fresh count.')
      }
      const now = new Date()
      if (request.approve
        && dec(stockCount.variance).gt(0)
        && await hasOpenTechnicalHoldAsync(tx, stockCount.projectId, stockCount.materialId)) {
        throw new InvalidOperationError(
          'A delivery for this material is still waiting for technical acceptance or replacement. It cannot enter usable stock through a count adjustment.')
      }
      await tx
        .update(stockCounts)
        .set({
          status: request.approve ? StockCountStatuses.Approved : StockCountStatuses.Rejected,
          reviewedByUserId: actorUserId,
          reviewNotes: notes,
          reviewedAt: now,
        })
        .where(eq(stockCounts.id, stockCount.id))
      if (request.approve && !dec(stockCount.variance).eq(0)) {
        await changeBalanceAsync(tx, stockCount.projectId, stockCount.materialId, dec(stockCount.variance),
          'CountAdjustment', 'StockCount', stockCount.id, stockCount.countNumber, actorUserId, notes, now)
      }
      await this.events.appendAsync({
        chainKey: `CNT-${stockCount.id}`,
        requisitionId: null,
        projectId: stockCount.projectId,
        entityType: 'StockCount',
        entityId: stockCount.id,
        referenceNumber: stockCount.countNumber,
        eventType: request.approve ? 'StockCountApproved' : 'StockCountRejected',
        actorUserId,
        actorRole,
        details: { Variance: stockCount.variance, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadCountAsync(id)
  }

  private async requireRoleAsync(userId: number, claimedRole: string, requiredRole: string): Promise<void> {
    await this.requireAnyRoleAsync(userId, claimedRole, requiredRole)
  }

  private async requireAnyRoleAsync(userId: number, claimedRole: string, ...allowed: string[]): Promise<void> {
    const actor = await this.roles.resolveAsync(userId)
    if (actor === null || actor.effectiveRole !== claimedRole || !allowed.includes(actor.effectiveRole)) {
      throw new UnauthorizedAccessError(`This action requires one of these roles: ${allowed.join(', ')}.`)
    }
  }

  private async requireProjectAccessAsync(db: DbExecutor, userId: number, projectId: number): Promise<void> {
    if (await this.canVerifyAllProjectsAsync(userId)) return
    const [assignment] = await db
      .select({ id: userProjectAssignments.id })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, userId),
        eq(userProjectAssignments.projectId, projectId),
        eq(userProjectAssignments.isActive, true)))
      .limit(1)
    if (!assignment) throw new UnauthorizedAccessError('You are not assigned to this project.')
  }

  private async canVerifyAllProjectsAsync(userId: number): Promise<boolean> {
    return (await this.roles.resolveAsync(userId))?.canSwitchRoles === true
  }

  /** `actorRole is not ("CEO" or "Auditor") && !CanVerifyAllProjects` → active assignment to the row's project. */
  private async projectScope(
    actorUserId: number,
    actorRole: string,
    projectColumn: AnyColumn,
  ): Promise<SQL | undefined> {
    if (actorRole === 'CEO' || actorRole === 'Auditor' || await this.canVerifyAllProjectsAsync(actorUserId)) {
      return undefined
    }

    return assignmentExists(this.db, actorUserId, projectColumn)
  }

  private async loadIssueAsync(id: number): Promise<MaterialIssueResponseDto> {
    const [issue] = await loadIssuesAsync(this.db, eq(materialIssues.id, id), { limit: 2 })
    if (!issue) throw new InvalidOperationError('Sequence contains no elements')
    return issue
  }

  private async loadTransferAsync(id: number): Promise<StockTransferResponseDto> {
    const [transfer] = await loadTransfersAsync(this.db, eq(stockTransfers.id, id), { limit: 2 })
    if (!transfer) throw new InvalidOperationError('Sequence contains no elements')
    return transfer
  }

  private async loadCountAsync(id: number): Promise<StockCountResponseDto> {
    const [stockCount] = await loadCountsAsync(this.db, eq(stockCounts.id, id), { limit: 2 })
    if (!stockCount) throw new InvalidOperationError('Sequence contains no elements')
    return stockCount
  }
}

function assignmentExists(db: DbExecutor, actorUserId: number, projectColumn: AnyColumn): SQL {
  return exists(db
    .select({ one: sql`1` })
    .from(userProjectAssignments)
    .where(and(
      eq(userProjectAssignments.userId, actorUserId),
      eq(userProjectAssignments.projectId, projectColumn),
      eq(userProjectAssignments.isActive, true))))
}

async function countRows(query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query
  return row?.value ?? 0
}

/** LINQ SingleOrDefault over at most two fetched rows. */
function singleOrDefault<T>(rows: T[]): T | null {
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0] ?? null
}

async function getBalanceAsync(db: DbExecutor, projectId: number, materialId: number) {
  return singleOrDefault(await db
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.projectId, projectId), eq(stockBalances.materialId, materialId)))
    .limit(2))
}

async function changeBalanceAsync(
  db: DbExecutor,
  projectId: number,
  materialId: number,
  delta: Decimal,
  movementType: string,
  referenceType: string,
  referenceId: number,
  referenceNumber: string,
  actorUserId: number,
  notes: string | null,
  now: Date,
): Promise<void> {
  const balance = await getBalanceAsync(db, projectId, materialId)
  if (balance === null && delta.lt(0)) throw new InvalidOperationError('Stock cannot move below zero.')
  const after = dec(balance?.quantityOnHand ?? 0).plus(delta)
  if (after.lt(0)) throw new InvalidOperationError('Stock cannot move below zero.')
  if (balance === null) {
    await db.insert(stockBalances).values({ projectId, materialId, quantityOnHand: toNumber(after), updatedAt: now })
  } else {
    await db
      .update(stockBalances)
      .set({ quantityOnHand: toNumber(after), updatedAt: now })
      .where(eq(stockBalances.id, balance.id))
  }
  await db.insert(stockLedgerEntries).values({
    projectId,
    materialId,
    movementType,
    quantityDelta: toNumber(delta),
    balanceAfter: toNumber(after),
    referenceType,
    referenceId,
    referenceNumber,
    actorUserId,
    notes,
    occurredAt: now,
  })
}

async function hasOpenTechnicalHoldAsync(db: DbExecutor, projectId: number, materialId: number): Promise<boolean> {
  const lines = await db
    .select({ id: purchaseOrderLines.id, quantity: purchaseOrderLines.quantity })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(
      eq(purchaseOrderLines.requiresTechnicalAcceptance, true),
      eq(purchaseOrderLines.materialId, materialId),
      eq(purchaseOrders.projectId, projectId)))
  if (lines.length === 0) return false

  const receipts = await loadReceiptsWithReviewsAsync(db, and(
    inArray(goodsReceipts.purchaseOrderLineId, lines.map(item => item.id)),
    gt(goodsReceipts.acceptedQuantity, 0)))

  // Receipts already posted to usable stock by the Storekeeper GRN need no further decision.
  const postedReceiptIds = new Set((await db
    .select({ referenceId: stockLedgerEntries.referenceId })
    .from(stockLedgerEntries)
    .where(and(
      eq(stockLedgerEntries.referenceType, 'GoodsReceipt'),
      eq(stockLedgerEntries.movementType, 'Receipt'),
      gt(stockLedgerEntries.quantityDelta, 0)))).map(item => item.referenceId))
  for (const line of lines) {
    const unsettled = receipts.filter(item =>
      item.receipt.purchaseOrderLineId === line.id && !postedReceiptIds.has(item.receipt.id))
    if (unsettled.length === 0) continue
    if (unsettled.some(item => latestTechnicalAcceptance(item.reviews) === null)) return true

    const acceptedQuantity = sum(unsettled
      .filter(item => latestTechnicalAcceptance(item.reviews)?.outcome === TechnicalAcceptanceOutcomes.Accepted)
      .map(item => item.receipt.acceptedQuantity))
    if (acceptedQuantity.lt(line.quantity)
      && unsettled.some(item => latestTechnicalAcceptance(item.reviews)?.outcome === TechnicalAcceptanceOutcomes.Rejected)) {
      return true
    }
  }

  return false
}

/** `.Include(item => item.TechnicalAcceptances)` for a set of receipts. */
async function loadReceiptsWithReviewsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
): Promise<{ receipt: GoodsReceiptRow; reviews: TechnicalAcceptanceRow[] }[]> {
  const receipts = await db.select().from(goodsReceipts).where(filter)
  if (receipts.length === 0) return []
  const reviews = await db
    .select()
    .from(goodsReceiptTechnicalAcceptances)
    .where(inArray(goodsReceiptTechnicalAcceptances.goodsReceiptId, receipts.map(item => item.id)))
  return receipts.map(receipt => ({
    receipt,
    reviews: reviews.filter(review => review.goodsReceiptId === receipt.id),
  }))
}

function latestTechnicalAcceptance<T extends { reviewSequence: number }>(reviews: T[]): T | null {
  return reviews.reduce<T | null>(
    (latest, review) => (latest === null || review.reviewSequence > latest.reviewSequence ? review : latest), null)
}

async function loadReceiptsAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<LoadedReceipt[]> {
  let query = db
    .select({
      receipt: goodsReceipts,
      purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
      requisitionId: purchaseOrders.requisitionId,
      supplierName: suppliers.name,
      lineQuantity: purchaseOrderLines.quantity,
      lineRequiresTechnicalAcceptance: purchaseOrderLines.requiresTechnicalAcceptance,
      projectName: projects.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      receivedByName: users.fullName,
    })
    .from(goodsReceipts)
    .innerJoin(purchaseOrders, eq(goodsReceipts.purchaseOrderId, purchaseOrders.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .innerJoin(purchaseOrderLines, eq(goodsReceipts.purchaseOrderLineId, purchaseOrderLines.id))
    .innerJoin(projects, eq(goodsReceipts.projectId, projects.id))
    .innerJoin(materials, eq(goodsReceipts.materialId, materials.id))
    .innerJoin(users, eq(goodsReceipts.receivedByUserId, users.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const reviews = await db
    .select({ review: goodsReceiptTechnicalAcceptances, engineerName: users.fullName })
    .from(goodsReceiptTechnicalAcceptances)
    .innerJoin(users, eq(goodsReceiptTechnicalAcceptances.engineerUserId, users.id))
    .where(inArray(goodsReceiptTechnicalAcceptances.goodsReceiptId, rows.map(row => row.receipt.id)))
  return rows.map(row => ({
    ...row,
    technicalAcceptances: reviews
      .filter(item => item.review.goodsReceiptId === row.receipt.id)
      .map(item => ({ ...item.review, engineerName: item.engineerName })),
  }))
}

async function loadIssuesAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<MaterialIssueResponseDto[]> {
  let query = db
    .select({
      issue: materialIssues,
      requestedQuantity: requisitions.quantity,
      projectName: projects.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      issuedByName: issuedByUser.fullName,
      issuedToName: issuedToUser.fullName,
    })
    .from(materialIssues)
    .innerJoin(requisitions, eq(materialIssues.requisitionId, requisitions.id))
    .innerJoin(projects, eq(materialIssues.projectId, projects.id))
    .innerJoin(materials, eq(materialIssues.materialId, materials.id))
    .innerJoin(issuedByUser, eq(materialIssues.issuedByUserId, issuedByUser.id))
    .innerJoin(issuedToUser, eq(materialIssues.issuedToUserId, issuedToUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.issue.id)
  const usage = await db
    .select({ record: materialUsageRecords, recordedByName: users.fullName })
    .from(materialUsageRecords)
    .innerJoin(users, eq(materialUsageRecords.recordedByUserId, users.id))
    .where(inArray(materialUsageRecords.materialIssueId, ids))
    .orderBy(asc(materialUsageRecords.recordedAt), asc(materialUsageRecords.id))
  const returns = await db
    .select({
      materialIssueId: materialReturns.materialIssueId,
      status: materialReturns.status,
      quantityAccepted: materialReturns.quantityAccepted,
    })
    .from(materialReturns)
    .where(inArray(materialReturns.materialIssueId, ids))
  const closeouts = await db
    .select({
      materialIssueId: materialCustodyCloseouts.materialIssueId,
      revision: materialCustodyCloseouts.revision,
      status: materialCustodyCloseouts.status,
    })
    .from(materialCustodyCloseouts)
    .where(inArray(materialCustodyCloseouts.materialIssueId, ids))

  return rows.map(({ issue, ...names }) => {
    const issueUsage = usage.filter(item => item.record.materialIssueId === issue.id)
    const used = sum(issueUsage.filter(item => item.record.usageType === 'Used').map(item => item.record.quantity))
    const wasted = sum(issueUsage.filter(item => item.record.usageType === 'Wastage').map(item => item.record.quantity))
    const returned = sum(returns
      .filter(item => item.materialIssueId === issue.id && item.status === MaterialReturnStatuses.Received)
      .map(item => item.quantityAccepted ?? 0))
    const confirmed = dec(issue.confirmedQuantity ?? 0)
    const closeout = closeouts
      .filter(item => item.materialIssueId === issue.id)
      .reduce<{ revision: number; status: string } | null>(
        (latest, item) => (latest === null || item.revision > latest.revision ? item : latest), null)
    return {
      id: issue.id,
      issueNumber: issue.issueNumber,
      requisitionId: issue.requisitionId,
      projectId: issue.projectId,
      projectName: names.projectName,
      materialId: issue.materialId,
      materialName: names.materialName,
      materialUnit: names.materialUnit,
      requestedQuantity: names.requestedQuantity,
      quantityIssued: issue.quantityIssued,
      status: issue.status,
      issuedByName: names.issuedByName,
      issuedToUserId: issue.issuedToUserId,
      issuedToName: names.issuedToName,
      notes: issue.notes,
      issuedAt: issue.issuedAt,
      confirmedQuantity: issue.confirmedQuantity,
      confirmationNotes: issue.confirmationNotes,
      confirmedAt: issue.confirmedAt,
      usedQuantity: toNumber(used),
      wastedQuantity: toNumber(wasted),
      returnedQuantity: toNumber(returned),
      unaccountedQuantity: toNumber(Decimal.max(0, confirmed.minus(used).minus(wasted).minus(returned))),
      custodyStatus: closeout?.status ?? (issue.status === MaterialIssueStatuses.Confirmed ? 'Open' : issue.status),
      usage: issueUsage.map(({ record, recordedByName }) => ({
        id: record.id,
        usageType: record.usageType,
        quantity: record.quantity,
        purposeOrReason: record.purposeOrReason,
        evidenceReference: record.evidenceReference,
        recordedByName,
        recordedAt: record.recordedAt,
      })),
    }
  })
}

async function loadTransfersAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<StockTransferResponseDto[]> {
  let query = db
    .select({
      transfer: stockTransfers,
      fromProjectName: fromProject.name,
      toProjectName: toProject.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      requestedByName: requestedByUser.fullName,
      dispatchedByName: dispatchedByUser.fullName,
      receivedByName: receivedByUser.fullName,
      resolvedByName: resolvedByUser.fullName,
    })
    .from(stockTransfers)
    .innerJoin(fromProject, eq(stockTransfers.fromProjectId, fromProject.id))
    .innerJoin(toProject, eq(stockTransfers.toProjectId, toProject.id))
    .innerJoin(materials, eq(stockTransfers.materialId, materials.id))
    .innerJoin(requestedByUser, eq(stockTransfers.requestedByUserId, requestedByUser.id))
    .leftJoin(dispatchedByUser, eq(stockTransfers.dispatchedByUserId, dispatchedByUser.id))
    .leftJoin(receivedByUser, eq(stockTransfers.receivedByUserId, receivedByUser.id))
    .leftJoin(resolvedByUser, eq(stockTransfers.resolvedByUserId, resolvedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(({ transfer, ...names }) => ({
    id: transfer.id,
    transferNumber: transfer.transferNumber,
    fromProjectId: transfer.fromProjectId,
    fromProjectName: names.fromProjectName,
    toProjectId: transfer.toProjectId,
    toProjectName: names.toProjectName,
    materialId: transfer.materialId,
    materialName: names.materialName,
    materialUnit: names.materialUnit,
    quantity: transfer.quantity,
    reason: transfer.reason,
    status: transfer.status,
    requestedByName: names.requestedByName,
    requestedAt: transfer.requestedAt,
    dispatchedByUserId: transfer.dispatchedByUserId,
    dispatchedByName: names.dispatchedByName,
    dispatchedAt: transfer.dispatchedAt,
    receivedByName: names.receivedByName,
    receivedQuantity: transfer.receivedQuantity,
    receiptNotes: transfer.receiptNotes,
    receivedAt: transfer.receivedAt,
    resolvedByName: names.resolvedByName,
    resolutionDisposition: transfer.resolutionDisposition,
    resolutionQuantity: transfer.resolutionQuantity,
    resolutionNotes: transfer.resolutionNotes,
    resolutionEvidenceReference: transfer.resolutionEvidenceReference,
    resolvedAt: transfer.resolvedAt,
  }))
}

async function loadCountsAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<StockCountResponseDto[]> {
  let query = db
    .select({
      stockCount: stockCounts,
      projectName: projects.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      countedByName: countedByUser.fullName,
      reviewedByName: reviewedByUser.fullName,
    })
    .from(stockCounts)
    .innerJoin(projects, eq(stockCounts.projectId, projects.id))
    .innerJoin(materials, eq(stockCounts.materialId, materials.id))
    .innerJoin(countedByUser, eq(stockCounts.countedByUserId, countedByUser.id))
    .leftJoin(reviewedByUser, eq(stockCounts.reviewedByUserId, reviewedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(({ stockCount, ...names }) => ({
    id: stockCount.id,
    countNumber: stockCount.countNumber,
    projectId: stockCount.projectId,
    projectName: names.projectName,
    materialId: stockCount.materialId,
    materialName: names.materialName,
    materialUnit: names.materialUnit,
    systemQuantity: stockCount.systemQuantity,
    countedQuantity: stockCount.countedQuantity,
    variance: stockCount.variance,
    notes: stockCount.notes,
    status: stockCount.status,
    countedByName: names.countedByName,
    countedAt: stockCount.countedAt,
    reviewedByName: names.reviewedByName,
    reviewNotes: stockCount.reviewNotes,
    reviewedAt: stockCount.reviewedAt,
  }))
}

async function findIssueAsync(db: DbExecutor, id: number): Promise<MaterialIssueRow> {
  const issue = singleOrDefault(await db.select().from(materialIssues).where(eq(materialIssues.id, id)).limit(2))
  if (issue === null) throw new KeyNotFoundError('The material issue was not found.')
  return issue
}

async function findTransferAsync(db: DbExecutor, id: number): Promise<StockTransferRow> {
  const transfer = singleOrDefault(await db.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(2))
  if (transfer === null) throw new KeyNotFoundError('The stock transfer was not found.')
  return transfer
}

async function lockMaterialIssueAsync(db: DbExecutor, issueId: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM "MaterialIssues" WHERE "Id" = ${issueId} FOR UPDATE`)
}

async function lockStockTransferAsync(db: DbExecutor, transferId: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM "StockTransfers" WHERE "Id" = ${transferId} FOR UPDATE`)
}

function toReceiptDto(item: LoadedReceipt): GoodsReceiptResponseDto {
  const latestReview = latestTechnicalAcceptance(item.technicalAcceptances)
  return {
    id: item.receipt.id,
    receiptNumber: item.receipt.receiptNumber,
    purchaseOrderId: item.receipt.purchaseOrderId,
    purchaseOrderNumber: item.purchaseOrderNumber,
    supplierName: item.supplierName,
    requisitionId: item.requisitionId,
    projectId: item.receipt.projectId,
    projectName: item.projectName,
    materialId: item.receipt.materialId,
    materialName: item.materialName,
    materialUnit: item.materialUnit,
    orderedQuantity: item.lineQuantity,
    deliveredQuantity: item.receipt.deliveredQuantity,
    acceptedQuantity: item.receipt.acceptedQuantity,
    rejectedQuantity: item.receipt.rejectedQuantity,
    condition: item.receipt.condition,
    deliveryNoteReference: item.receipt.deliveryNoteReference,
    evidenceReference: item.receipt.evidenceReference,
    discrepancyNotes: item.receipt.discrepancyNotes,
    receivedByName: item.receivedByName,
    receivedAt: item.receipt.receivedAt,
    requiresTechnicalAcceptance: item.lineRequiresTechnicalAcceptance,
    technicalAcceptanceStatus: !item.lineRequiresTechnicalAcceptance || dec(item.receipt.acceptedQuantity).lte(0)
      ? 'NotRequired'
      : latestReview?.outcome ?? 'Pending',
    technicalAcceptanceReviewedByName: latestReview?.engineerName ?? null,
    technicalAcceptanceReviewedAt: latestReview?.reviewedAt ?? null,
  }
}

function toTechnicalAcceptanceDto(item: LoadedReceipt): TechnicalAcceptanceResponseDto {
  const latestReview = latestTechnicalAcceptance(item.technicalAcceptances)
  return {
    goodsReceiptId: item.receipt.id,
    technicalAcceptanceId: latestReview?.id ?? null,
    receiptNumber: item.receipt.receiptNumber,
    purchaseOrderId: item.receipt.purchaseOrderId,
    purchaseOrderNumber: item.purchaseOrderNumber,
    requisitionId: item.requisitionId,
    projectId: item.receipt.projectId,
    projectName: item.projectName,
    supplierName: item.supplierName,
    materialId: item.receipt.materialId,
    materialName: item.materialName,
    materialUnit: item.materialUnit,
    orderedQuantity: item.lineQuantity,
    deliveredQuantity: item.receipt.deliveredQuantity,
    acceptedQuantity: item.receipt.acceptedQuantity,
    condition: item.receipt.condition,
    deliveryNoteReference: item.receipt.deliveryNoteReference,
    receiptEvidenceReference: item.receipt.evidenceReference,
    receivedByName: item.receivedByName,
    receivedAt: item.receipt.receivedAt,
    requiresTechnicalAcceptance: item.lineRequiresTechnicalAcceptance,
    status: latestReview?.outcome ?? 'Pending',
    outcome: latestReview?.outcome ?? null,
    reviewSequence: latestReview?.reviewSequence ?? null,
    reviewedByUserId: latestReview?.engineerUserId ?? null,
    reviewedByName: latestReview?.engineerName ?? null,
    notes: latestReview?.notes ?? null,
    reviewEvidenceReference: latestReview?.evidenceReference ?? null,
    reviewedAt: latestReview?.reviewedAt ?? null,
  }
}

function normalizeTechnicalAcceptanceStatus(status: string | null): string | null {
  if (status === null || status.trim() === '') return null
  switch (status.trim().toLowerCase()) {
    case 'pending': return 'Pending'
    case 'accepted': return TechnicalAcceptanceOutcomes.Accepted
    case 'rejected': return TechnicalAcceptanceOutcomes.Rejected
    default:
      throw new ArgumentError('Technical acceptance status must be Pending, Accepted, or Rejected.', 'status')
  }
}

function normalizeTechnicalAcceptanceOutcome(outcome: string): string {
  switch (InputNormalizer.requiredText(outcome, 'outcome', 1, 20).toLowerCase()) {
    case 'accepted': return TechnicalAcceptanceOutcomes.Accepted
    case 'rejected': return TechnicalAcceptanceOutcomes.Rejected
    default:
      throw new ArgumentError('Technical acceptance outcome must be Accepted or Rejected.', 'outcome')
  }
}

/** `$"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..30]` (lower-case hex, not upper-cased). */
function reference(prefix: string, now: Date): string {
  const iso = now.toISOString()
  const stamp = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`
  return `${prefix}-${stamp}-${randomUUID().replace(/-/g, '')}`.slice(0, Math.min(30, prefix.length + 1 + 6 + 1 + 32))
}

function chain(requisitionId: number): string {
  return `REQ-${requisitionId}`
}

function pageOf<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return createPaginatedResult({ items, totalCount: total, page, pageSize })
}
