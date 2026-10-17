import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, exists, inArray, isNotNull, not, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  ArgumentError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, formatNumber, roundAwayFromZero, sum, toNumber, type Decimal } from '@/ConstructionMS.Application/Common/Money'
import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  AuthorizePaymentRequestDto,
  CashBookEntryResponseDto,
  CashBookResponseDto,
  CeoInvoiceDecisionRequestDto,
  ControlEventResponseDto,
  CreateSupplierInvoiceRequestDto,
  ExecutePaymentRequestDto,
  PaymentAuthorizationResponseDto,
  PaymentResponseDto,
  ReviewInvoiceRequestDto,
  SupplierInvoiceResponseDto,
} from '@/ConstructionMS.Application/DTOs/Finance/FinanceDtos'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IFinanceWorkflowService } from '@/ConstructionMS.Application/Services/Finance/IFinanceWorkflowService'
import {
  InvoiceStatuses,
  PettyCashReconciliationStatuses,
  PettyCashStatuses,
} from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import { TechnicalAcceptanceOutcomes } from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { PurchaseOrderInvariant } from '../../Common/PurchaseOrderInvariant'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  cashAccounts,
  cashLedgerEntries,
  controlEvents,
  costCodes,
  goodsReceipts,
  materials,
  paymentAuthorizations,
  paymentReceipts,
  payments,
  pettyCashDisbursements,
  pettyCashReconciliations,
  pettyCashRequests,
  projectBudgets,
  projects,
  purchaseOrderEvents,
  purchaseOrderLines,
  purchaseOrders,
  requisitionApprovalEvents,
  requisitions,
  sourcingRoundEvents,
  sourcingRounds,
  supplierInvoices,
  suppliers,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { ControlEventWriter } from '../ControlEventWriter'

type SupplierInvoiceRow = typeof supplierInvoices.$inferSelect
type PaymentAuthorizationRow = typeof paymentAuthorizations.$inferSelect
type PaymentRow = typeof payments.$inferSelect
type CashAccountRow = typeof cashAccounts.$inferSelect

const Serializable = { isolationLevel: IsolationLevel.Serializable } as const

const capturedByUser = alias(users, 'captured_by_user')
const reviewedByUser = alias(users, 'reviewed_by_user')

/** A supplier invoice with the navigations InvoiceQuery() included. */
interface LoadedInvoice {
  invoice: SupplierInvoiceRow
  purchaseOrderNumber: string
  requisitionId: number
  projectName: string
  supplierName: string
  capturedByName: string
  reviewedByName: string | null
  lines: { quantity: number; unitPrice: number; materialName: string; materialUnit: string }[]
  receipts: { acceptedQuantity: number; latestOutcome: string | null }[]
}

export class FinanceWorkflowService implements IFinanceWorkflowService {
  static readonly CeoExceptionThreshold = 500_000

  private static readonly ActiveInvoiceStatuses = [
    InvoiceStatuses.PendingReview, InvoiceStatuses.Matched, InvoiceStatuses.AwaitingCeoApproval,
    InvoiceStatuses.ReadyForAuthorization, InvoiceStatuses.Authorized, InvoiceStatuses.Paid,
  ]

  private readonly events: ControlEventWriter

  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
  ) {
    this.events = new ControlEventWriter(db)
  }

  async getInvoicesAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    status: string | null = null,
  ): Promise<PaginatedResult<SupplierInvoiceResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Procurement Officer', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      await this.projectScope(actorUserId, actorRole, supplierInvoices.projectId),
      projectId !== null ? eq(supplierInvoices.projectId, projectId) : undefined,
      status !== null && status.trim() !== '' ? eq(supplierInvoices.status, status.trim()) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db.select({ value: count() }).from(supplierInvoices).where(filter))
    const items = await loadInvoicesAsync(this.db, filter, {
      orderBy: [desc(supplierInvoices.capturedAt), desc(supplierInvoices.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items.map(item => toInvoiceDto(item, null, null)), total, pagination.page, pagination.pageSize)
  }

  async createInvoiceAsync(
    request: CreateSupplierInvoiceRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierInvoiceResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Procurement Officer')
    const invoiceNumber = InputNormalizer.requiredText(request.invoiceNumber, 'InvoiceNumber', 1, 100).toUpperCase()
    const quantity = InputNormalizer.positive(request.quantity, 'Quantity', 18, 3)
    const unitPrice = InputNormalizer.positive(request.unitPrice, 'UnitPrice', 18, 2)
    const amount = InputNormalizer.positive(request.amount, 'Amount', 18, 2)
    const document = InputNormalizer.optionalText(request.documentReference, 'DocumentReference', 500)
    const invoiceId = await this.db.transaction(async (tx) => {
      const order = singleOrDefault(await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, request.purchaseOrderId))
        .limit(2))
      if (order === null) throw new KeyNotFoundError('The purchase order was not found.')
      if (order.status !== PurchaseOrderWorkflowStates.Issued) {
        throw new InvalidOperationError('An invoice can be captured only for an issued purchase order.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, order.projectId)
      const lines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, order.id))
        .orderBy(asc(purchaseOrderLines.id))
      const line = PurchaseOrderInvariant.requireSingleLine({ lines })
      const receipts = await loadReceiptOutcomesAsync(tx, [order.id])
      const acceptedQuantity = quantityEligibleForInvoice(receipts)
      if (!acceptedQuantity.eq(line.quantity)) {
        throw new InvalidOperationError(
          'The full purchase-order quantity must be accepted by Stores before its supplier invoice can enter Finance review.')
      }
      const [live] = await tx
        .select({ id: supplierInvoices.id })
        .from(supplierInvoices)
        .where(and(
          eq(supplierInvoices.purchaseOrderId, order.id),
          inArray(supplierInvoices.status, FinanceWorkflowService.ActiveInvoiceStatuses)))
        .limit(1)
      if (live) throw new InvalidOperationError('This purchase order already has a live supplier invoice.')
      const [duplicate] = await tx
        .select({ id: supplierInvoices.id })
        .from(supplierInvoices)
        .where(and(eq(supplierInvoices.supplierId, order.supplierId), eq(supplierInvoices.invoiceNumber, invoiceNumber)))
        .limit(1)
      if (duplicate) throw new InvalidOperationError('That supplier invoice number is already recorded.')
      const now = new Date()
      const [invoice] = await tx
        .insert(supplierInvoices)
        .values({
          invoiceNumber,
          purchaseOrderId: order.id,
          projectId: order.projectId,
          supplierId: order.supplierId,
          quantity,
          unitPrice,
          amount,
          documentReference: document,
          capturedByUserId: actorUserId,
          capturedAt: now,
          status: InvoiceStatuses.PendingReview,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: chain(order.requisitionId),
        requisitionId: order.requisitionId,
        projectId: order.projectId,
        entityType: 'SupplierInvoice',
        entityId: invoice!.id,
        referenceNumber: invoice!.invoiceNumber,
        eventType: 'InvoiceCaptured',
        actorUserId,
        actorRole,
        details: { quantity, unitPrice, amount, document },
        occurredAt: now,
      }, tx)
      return invoice!.id
    }, Serializable)
    return await this.loadInvoiceAsync(invoiceId)
  }

  async reviewInvoiceAsync(
    id: number,
    request: ReviewInvoiceRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierInvoiceResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Finance Officer')
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      const invoice = await findInvoiceAsync(tx, id)
      if (invoice.status !== InvoiceStatuses.PendingReview) throw new InvalidOperationError('Only a pending invoice can be matched.')
      if (invoice.capturedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The invoice capturer cannot perform the independent Finance match.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, invoice.projectId)
      const [order] = await tx
        .select({ requisitionId: purchaseOrders.requisitionId })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, invoice.purchaseOrderId))
        .limit(1)
      const lines = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, invoice.purchaseOrderId))
        .orderBy(asc(purchaseOrderLines.id))
      const line = PurchaseOrderInvariant.requireSingleLine({ lines })
      const accepted = quantityEligibleForInvoice(await loadReceiptOutcomesAsync(tx, [invoice.purchaseOrderId]))
      if (!accepted.eq(line.quantity)) {
        throw new InvalidOperationError(
          'The full purchase-order quantity must be accepted by Stores before Finance can complete the match.')
      }
      const quantityMatches = dec(invoice.quantity).eq(accepted)
      const priceMatches = dec(invoice.unitPrice).eq(line.unitPrice)
      const amountMatches = dec(invoice.amount).eq(roundAwayFromZero(dec(invoice.quantity).times(invoice.unitPrice), 2))
      const allMatch = quantityMatches && priceMatches && amountMatches
      const now = new Date()
      // The Finance match itself records the payment authority; no separate Supervisor authorization step exists.
      const status = !allMatch
        ? InvoiceStatuses.Mismatch
        : dec(invoice.amount).gt(FinanceWorkflowService.CeoExceptionThreshold)
          ? InvoiceStatuses.AwaitingCeoApproval
          : InvoiceStatuses.Authorized
      await tx
        .update(supplierInvoices)
        .set({
          receivedQuantitySnapshot: toNumber(accepted),
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          matchNotes: notes,
          status,
        })
        .where(eq(supplierInvoices.id, invoice.id))
      const requisitionId = order!.requisitionId
      await this.events.appendAsync({
        chainKey: chain(requisitionId),
        requisitionId,
        projectId: invoice.projectId,
        entityType: 'SupplierInvoice',
        entityId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        eventType: allMatch
          ? (status === InvoiceStatuses.AwaitingCeoApproval ? 'InvoiceMatchedCeoException' : 'InvoiceMatched')
          : 'InvoiceMismatch',
        actorUserId,
        actorRole,
        details: { quantityMatches, priceMatches, amountMatches, accepted: toNumber(accepted), notes },
        occurredAt: now,
      }, tx)
      if (status === InvoiceStatuses.Authorized) {
        const authorization = await insertAuthorizationAsync(tx, invoice, actorUserId, notes, now)
        await this.appendAuthorizedEventAsync(tx, authorization, invoice, requisitionId, actorUserId, actorRole, notes, now)
      }
    }, Serializable)
    return await this.loadInvoiceAsync(id)
  }

  async recordCeoDecisionAsync(
    id: number,
    request: CeoInvoiceDecisionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierInvoiceResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'CEO')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      const invoice = await findInvoiceAsync(tx, id)
      if (invoice.status !== InvoiceStatuses.AwaitingCeoApproval) {
        throw new InvalidOperationError('This invoice is not awaiting a CEO exception decision.')
      }
      if (invoice.reviewedByUserId === actorUserId || invoice.capturedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The source or Finance reviewer cannot make the CEO exception decision.')
      }
      const requisitionId = await purchaseOrderRequisitionIdAsync(tx, invoice.purchaseOrderId)
      const now = new Date()
      // The CEO exception decision records the payment authority directly; Finance then executes it.
      await tx
        .update(supplierInvoices)
        .set({
          ceoDecisionByUserId: actorUserId,
          ceoDecision: request.approve ? 'Approved' : 'Rejected',
          ceoDecisionNotes: notes,
          ceoDecisionAt: now,
          status: request.approve ? InvoiceStatuses.Authorized : InvoiceStatuses.Rejected,
        })
        .where(eq(supplierInvoices.id, invoice.id))
      await this.events.appendAsync({
        chainKey: chain(requisitionId),
        requisitionId,
        projectId: invoice.projectId,
        entityType: 'SupplierInvoice',
        entityId: invoice.id,
        referenceNumber: invoice.invoiceNumber,
        eventType: request.approve ? 'CeoExceptionApproved' : 'CeoExceptionRejected',
        actorUserId,
        actorRole,
        details: { notes },
        occurredAt: now,
      }, tx)
      if (request.approve) {
        const authorization = await insertAuthorizationAsync(tx, invoice, actorUserId, notes, now)
        await this.appendAuthorizedEventAsync(tx, authorization, invoice, requisitionId, actorUserId, actorRole, notes, now)
      }
    }, Serializable)
    return await this.loadInvoiceAsync(id)
  }

  async authorizePaymentAsync(
    id: number,
    request: AuthorizePaymentRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<SupplierInvoiceResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    await this.db.transaction(async (tx) => {
      const invoice = await findInvoiceAsync(tx, id)
      if (invoice.status !== InvoiceStatuses.ReadyForAuthorization) {
        throw new InvalidOperationError('The invoice has not passed all required matching and exception checks.')
      }
      if (invoice.reviewedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The Finance reviewer cannot authorize the resulting payment.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, invoice.projectId)
      const requisitionId = await purchaseOrderRequisitionIdAsync(tx, invoice.purchaseOrderId)
      const now = new Date()
      const authorization = await insertAuthorizationAsync(tx, invoice, actorUserId, notes, now)
      await tx
        .update(supplierInvoices)
        .set({ status: InvoiceStatuses.Authorized })
        .where(eq(supplierInvoices.id, invoice.id))
      await this.appendAuthorizedEventAsync(tx, authorization, invoice, requisitionId, actorUserId, actorRole, notes, now)
    }, Serializable)
    return await this.loadInvoiceAsync(id)
  }

  async getAuthorizationsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    unpaidOnly = false,
  ): Promise<PaginatedResult<PaymentAuthorizationResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      await this.projectScope(actorUserId, actorRole, supplierInvoices.projectId),
      unpaidOnly
        ? not(exists(this.db
          .select({ one: sql`1` })
          .from(payments)
          .where(eq(payments.paymentAuthorizationId, paymentAuthorizations.id))))
        : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db
      .select({ value: count() })
      .from(paymentAuthorizations)
      .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
      .where(filter))
    const items = await loadAuthorizationsAsync(this.db, filter, {
      orderBy: [desc(paymentAuthorizations.authorizedAt)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items, total, pagination.page, pagination.pageSize)
  }

  async executePaymentAsync(
    authorizationId: number,
    request: ExecutePaymentRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaymentResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Finance Officer')
    const method = InputNormalizer.requiredText(request.method, 'Method', 1, 30)
    if (method !== 'BankTransfer' && method !== 'MPesa' && method !== 'Cheque' && method !== 'Cash') {
      throw new ArgumentError('Payment method must be BankTransfer, MPesa, Cheque, or Cash.')
    }
    const externalReference = InputNormalizer.requiredText(request.externalReference, 'ExternalReference', 1, 100).toUpperCase()
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const paymentId = await this.db.transaction(async (tx) => {
      const authorization = singleOrDefault(await tx
        .select({
          authorization: paymentAuthorizations,
          invoice: supplierInvoices,
          requisitionId: purchaseOrders.requisitionId,
        })
        .from(paymentAuthorizations)
        .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
        .innerJoin(purchaseOrders, eq(supplierInvoices.purchaseOrderId, purchaseOrders.id))
        .where(eq(paymentAuthorizations.id, authorizationId))
        .limit(2))
      if (authorization === null) throw new KeyNotFoundError('The payment authorization was not found.')
      const invoice = authorization.invoice
      if (invoice.status !== InvoiceStatuses.Authorized) {
        throw new InvalidOperationError('This authorization is not available for payment.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, invoice.projectId)
      const cashAccount = await resolveCashAccountForPostingAsync(
        tx, invoice.projectId, request.cashAccountId, authorization.authorization.amount)
      const [alreadyPaid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.paymentAuthorizationId, authorization.authorization.id))
        .limit(1)
      if (alreadyPaid) throw new InvalidOperationError('This authorization has already been paid.')
      const [paymentReference] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.externalReference, externalReference))
        .limit(1)
      const [pettyCashReference] = paymentReference
        ? [paymentReference]
        : await tx
          .select({ id: pettyCashDisbursements.id })
          .from(pettyCashDisbursements)
          .where(eq(pettyCashDisbursements.externalReference, externalReference))
          .limit(1)
      if (pettyCashReference) throw new InvalidOperationError('That external payment reference is already recorded.')
      const now = new Date()
      const [payment] = await tx
        .insert(payments)
        .values({
          paymentNumber: reference('PAY', now),
          paymentAuthorizationId: authorization.authorization.id,
          amount: authorization.authorization.amount,
          method,
          externalReference,
          evidenceReference: evidence,
          paidByUserId: actorUserId,
          paidAt: now,
        })
        .returning()
      await tx.update(supplierInvoices).set({ status: InvoiceStatuses.Paid }).where(eq(supplierInvoices.id, invoice.id))
      if (cashAccount !== null) {
        const balance = dec(cashAccount.balance).minus(payment!.amount)
        await tx
          .update(cashAccounts)
          .set({ balance: toNumber(balance), updatedAt: now })
          .where(eq(cashAccounts.id, cashAccount.id))
        await tx.insert(cashLedgerEntries).values({
          entryNumber: reference('CASH', now),
          cashAccountId: cashAccount.id,
          projectId: invoice.projectId,
          amountDelta: toNumber(dec(payment!.amount).negated()),
          balanceAfter: toNumber(balance),
          entryType: 'SupplierPayment',
          referenceType: 'Payment',
          referenceId: payment!.id,
          referenceNumber: payment!.paymentNumber,
          postedByUserId: actorUserId,
          postedAt: now,
          notes: `Supplier invoice ${invoice.invoiceNumber}`,
        })
      }
      const [receipt] = await tx
        .insert(paymentReceipts)
        .values({
          receiptNumber: reference('RCT', now),
          paymentId: payment!.id,
          amount: payment!.amount,
          issuedByUserId: actorUserId,
          issuedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: chain(authorization.requisitionId),
        requisitionId: authorization.requisitionId,
        projectId: invoice.projectId,
        entityType: 'Payment',
        entityId: payment!.id,
        referenceNumber: payment!.paymentNumber,
        eventType: 'PaymentExecuted',
        actorUserId,
        actorRole,
        details: {
          Amount: payment!.amount,
          method,
          externalReference,
          ReceiptNumber: receipt!.receiptNumber,
          evidence,
          cashAccountId: cashAccount?.id ?? null,
          cashAccountName: cashAccount?.name ?? null,
        },
        occurredAt: now,
      }, tx)
      return payment!.id
    }, Serializable)
    const [payment] = await loadPaymentsAsync(this.db, eq(payments.id, paymentId), { limit: 2 })
    if (!payment) throw new InvalidOperationError('Sequence contains no elements')
    return payment
  }

  async getPaymentsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
  ): Promise<PaginatedResult<PaymentResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    const filter = await this.projectScope(actorUserId, actorRole, supplierInvoices.projectId)
    const pagination = Pagination.normalize(page, pageSize)
    const total = await countRows(this.db
      .select({ value: count() })
      .from(payments)
      .innerJoin(paymentAuthorizations, eq(payments.paymentAuthorizationId, paymentAuthorizations.id))
      .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
      .where(filter))
    const items = await loadPaymentsAsync(this.db, filter, {
      orderBy: [desc(payments.paidAt)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return pageOf(items, total, pagination.page, pagination.pageSize)
  }

  async getCashBookAsync(actorUserId: number, actorRole: string): Promise<CashBookResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'CEO', 'Auditor', 'Finance Officer')

    // CEO and Auditor see every project; a Finance Officer sees only assigned projects.
    const projectRows = await this.db
      .select({ id: projects.id, name: projects.name, budget: projects.budget })
      .from(projects)
      .where(await this.projectScope(actorUserId, actorRole, projects.id))
      .orderBy(asc(projects.id))
    const projectIds = projectRows.map(item => item.id)
    if (projectIds.length === 0) {
      return { generatedAt: new Date(), projects: [] }
    }

    const budgetRevisions = await this.db
      .select({ projectId: projectBudgets.projectId, approvedAmount: projectBudgets.approvedAmount })
      .from(projectBudgets)
      .where(inArray(projectBudgets.projectId, projectIds))
      .orderBy(desc(projectBudgets.createdAt), desc(projectBudgets.id))
    const budgets = new Map<number, number>()
    for (const revision of budgetRevisions) {
      if (!budgets.has(revision.projectId)) budgets.set(revision.projectId, revision.approvedAmount)
    }

    const supplierRows = await this.db
      .select({
        projectId: supplierInvoices.projectId,
        amount: payments.amount,
        supplierName: suppliers.name,
        invoiceNumber: supplierInvoices.invoiceNumber,
        materialName: sql<string | null>`(
          SELECT material."Name" FROM "PurchaseOrderLines" AS line
          INNER JOIN "Materials" AS material ON material."Id" = line."MaterialId"
          WHERE line."PurchaseOrderId" = ${supplierInvoices.purchaseOrderId}
          LIMIT 1)`,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(paymentAuthorizations, eq(payments.paymentAuthorizationId, paymentAuthorizations.id))
      .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(inArray(supplierInvoices.projectId, projectIds))

    const pettyCashRows = await this.db
      .select({
        projectId: pettyCashRequests.projectId,
        amountExpensed: pettyCashReconciliations.amountExpensed,
        amountSpent: pettyCashReconciliations.amountSpent,
        purpose: pettyCashRequests.purpose,
        costCodeName: costCodes.name,
        reviewedAt: pettyCashReconciliations.reviewedAt,
        submittedAt: pettyCashReconciliations.submittedAt,
      })
      .from(pettyCashReconciliations)
      .innerJoin(pettyCashRequests, eq(pettyCashReconciliations.pettyCashRequestId, pettyCashRequests.id))
      .innerJoin(costCodes, eq(pettyCashRequests.costCodeId, costCodes.id))
      .where(and(
        eq(pettyCashReconciliations.status, PettyCashReconciliationStatuses.Approved),
        inArray(pettyCashRequests.projectId, projectIds)))

    const siteCashRows = await this.db
      .select({
        projectId: pettyCashRequests.projectId,
        amount: pettyCashDisbursements.amount,
        purpose: pettyCashRequests.purpose,
        recipientName: pettyCashDisbursements.recipientName,
        disbursedAt: pettyCashDisbursements.disbursedAt,
      })
      .from(pettyCashDisbursements)
      .innerJoin(pettyCashRequests, eq(pettyCashDisbursements.pettyCashRequestId, pettyCashRequests.id))
      .where(and(
        not(exists(this.db
          .select({ one: sql`1` })
          .from(pettyCashReconciliations)
          .where(and(
            eq(pettyCashReconciliations.pettyCashRequestId, pettyCashRequests.id),
            eq(pettyCashReconciliations.status, PettyCashReconciliationStatuses.Approved))))),
        inArray(pettyCashRequests.projectId, projectIds)))

    const purchaseCommitmentRows = await this.db
      .select({
        projectId: purchaseOrders.projectId,
        amount: sql<string>`COALESCE(SUM(${purchaseOrderLines.quantity} * ${purchaseOrderLines.unitPrice}), 0)`,
      })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .where(and(
        inArray(purchaseOrders.status, [PurchaseOrderWorkflowStates.Approved, PurchaseOrderWorkflowStates.Issued]),
        inArray(purchaseOrders.projectId, projectIds),
        not(exists(this.db
          .select({ one: sql`1` })
          .from(payments)
          .innerJoin(paymentAuthorizations, eq(payments.paymentAuthorizationId, paymentAuthorizations.id))
          .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
          .where(eq(supplierInvoices.purchaseOrderId, purchaseOrderLines.purchaseOrderId))))))
      .groupBy(purchaseOrders.projectId)

    const pettyCashCommitmentRows = await this.db
      .select({
        projectId: pettyCashRequests.projectId,
        amount: sql<string>`COALESCE(SUM(COALESCE(${pettyCashRequests.amountCommitted}, 0)), 0)`,
      })
      .from(pettyCashRequests)
      .where(and(
        eq(pettyCashRequests.status, PettyCashStatuses.Approved),
        isNotNull(pettyCashRequests.amountCommitted),
        inArray(pettyCashRequests.projectId, projectIds)))
      .groupBy(pettyCashRequests.projectId)

    const result = projectRows.map(project => {
      const projectSupplierRows = supplierRows.filter(item => item.projectId === project.id)
      const projectPettyCashRows = pettyCashRows.filter(item => item.projectId === project.id)
      const projectSiteCashRows = siteCashRows.filter(item => item.projectId === project.id)
      const supplierPayments = sum(projectSupplierRows.map(item => item.amount))
      const pettyCashSpent = sum(projectPettyCashRows.map(item => item.amountExpensed ?? item.amountSpent))
      const cashAwaitingAccountability = sum(projectSiteCashRows.map(item => item.amount))
      const openCommitments = sum(purchaseCommitmentRows.filter(item => item.projectId === project.id).map(item => item.amount))
        .plus(sum(pettyCashCommitmentRows.filter(item => item.projectId === project.id).map(item => item.amount)))
      const allocatedBudget = dec(budgets.get(project.id) ?? project.budget)
      const totalUsed = supplierPayments.plus(pettyCashSpent)

      const entries: CashBookEntryResponseDto[] = [
        ...projectSupplierRows.map(item => ({
          entryType: 'Supplier payment',
          title: item.supplierName,
          detail: item.materialName === null || item.materialName.trim() === ''
            ? `Invoice ${item.invoiceNumber}`
            : `${item.materialName} · Invoice ${item.invoiceNumber}`,
          amount: item.amount,
          state: 'Used',
          occurredAt: item.paidAt,
        })),
        ...projectPettyCashRows.map(item => ({
          entryType: 'Petty cash',
          title: item.purpose,
          detail: item.costCodeName,
          amount: item.amountExpensed ?? item.amountSpent,
          state: 'Used',
          occurredAt: item.reviewedAt ?? item.submittedAt,
        })),
        ...projectSiteCashRows.map(item => ({
          entryType: 'Petty cash',
          title: item.purpose,
          detail: `With ${item.recipientName}`,
          amount: item.amount,
          state: 'Awaiting accountability',
          occurredAt: item.disbursedAt,
        })),
      ]
        // Array.prototype.sort is stable, like LINQ OrderByDescending.
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 8)

      return {
        projectId: project.id,
        projectName: project.name,
        allocatedBudget: toNumber(allocatedBudget),
        supplierPayments: toNumber(supplierPayments),
        pettyCashSpent: toNumber(pettyCashSpent),
        openCommitments: toNumber(openCommitments),
        cashAwaitingAccountability: toNumber(cashAwaitingAccountability),
        totalUsed: toNumber(totalUsed),
        budgetAvailable: toNumber(allocatedBudget.minus(totalUsed).minus(openCommitments).minus(cashAwaitingAccountability)),
        entryCount: projectSupplierRows.length + projectPettyCashRows.length + projectSiteCashRows.length,
        recentEntries: entries,
      }
    })

    return { generatedAt: new Date(), projects: result }
  }

  async getControlEventsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    requisitionId: number | null = null,
    chainKey: string | null = null,
  ): Promise<PaginatedResult<ControlEventResponseDto>> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'CEO', 'Auditor')
    if (projectId !== null && projectId <= 0) throw new ArgumentError('Project ID must be positive.', 'projectId')
    if (requisitionId !== null && requisitionId <= 0) {
      throw new ArgumentError('Requisition ID must be positive.', 'requisitionId')
    }
    const pagination = Pagination.normalize(page, pageSize)
    const windowSize = Math.min(INT_MAX, pagination.offset + pagination.pageSize)

    const normalizedChainKey = normalizeChainKey(chainKey)
    let effectiveRequisitionId = requisitionId
    let isStandaloneChain = false
    if (normalizedChainKey !== null) {
      if (normalizedChainKey.startsWith('REQ-')) {
        const idText = normalizedChainKey.slice(4)
        const chainRequisitionId = /^[+-]?\d+$/.test(idText.trim()) ? Number(idText.trim()) : NaN
        if (!Number.isInteger(chainRequisitionId) || Math.abs(chainRequisitionId) > INT_MAX) {
          throw new ArgumentError('The requisition chain ID is outside the supported range.', 'chainKey')
        }
        if (requisitionId !== null && requisitionId !== chainRequisitionId) {
          throw new ArgumentError('The requisition ID does not match the requested chain key.', 'requisitionId')
        }
        effectiveRequisitionId = chainRequisitionId
      } else {
        if (requisitionId !== null) {
          throw new ArgumentError('A requisition ID cannot be combined with a standalone chain key.', 'requisitionId')
        }
        isStandaloneChain = true
      }
    }

    const controlFilter = and(
      projectId !== null ? eq(controlEvents.projectId, projectId) : undefined,
      effectiveRequisitionId !== null ? eq(controlEvents.requisitionId, effectiveRequisitionId) : undefined,
      normalizedChainKey !== null ? eq(controlEvents.chainKey, normalizedChainKey) : undefined)
    const controlCount = await countRows(this.db.select({ value: count() }).from(controlEvents).where(controlFilter))
    const controls: ControlEventResponseDto[] = (await this.db
      .select({
        chainKey: controlEvents.chainKey,
        sequenceNumber: controlEvents.sequenceNumber,
        requisitionId: controlEvents.requisitionId,
        projectId: controlEvents.projectId,
        projectName: projects.name,
        entityType: controlEvents.entityType,
        entityId: controlEvents.entityId,
        referenceNumber: controlEvents.referenceNumber,
        eventType: controlEvents.eventType,
        actorName: users.fullName,
        actorRole: controlEvents.actorRole,
        materialName: materials.name,
        materialUnit: materials.unit,
        requestedQuantity: requisitions.quantity,
        detailsJson: sql<string | null>`${controlEvents.detailsJson}::text`,
        occurredAt: controlEvents.occurredAt,
        eventHash: controlEvents.eventHash,
      })
      .from(controlEvents)
      .innerJoin(projects, eq(controlEvents.projectId, projects.id))
      .innerJoin(users, eq(controlEvents.actorUserId, users.id))
      .leftJoin(requisitions, eq(controlEvents.requisitionId, requisitions.id))
      .leftJoin(materials, eq(requisitions.materialId, materials.id))
      .where(controlFilter)
      .orderBy(desc(controlEvents.occurredAt), desc(controlEvents.sequenceNumber))
      .limit(windowSize))
      .map(item => ({ ...item, eventQuantity: null }))

    let requisitionItems: ControlEventResponseDto[] = []
    let sourcingItems: ControlEventResponseDto[] = []
    let orderItems: ControlEventResponseDto[] = []
    let requisitionCount = 0
    let sourcingCount = 0
    let orderCount = 0
    if (!isStandaloneChain) {
      const reqFilter = and(
        projectId !== null ? eq(requisitions.projectId, projectId) : undefined,
        effectiveRequisitionId !== null ? eq(requisitionApprovalEvents.requisitionId, effectiveRequisitionId) : undefined)
      requisitionCount = await countRows(this.db
        .select({ value: count() })
        .from(requisitionApprovalEvents)
        .innerJoin(requisitions, eq(requisitionApprovalEvents.requisitionId, requisitions.id))
        .where(reqFilter))
      requisitionItems = (await this.db
        .select({
          requisitionId: requisitionApprovalEvents.requisitionId,
          sequenceNumber: requisitionApprovalEvents.sequenceNumber,
          projectId: requisitions.projectId,
          projectName: projects.name,
          eventType: requisitionApprovalEvents.eventType,
          actorName: users.fullName,
          actorRole: requisitionApprovalEvents.actorRole,
          materialName: materials.name,
          materialUnit: materials.unit,
          requestedQuantity: requisitions.quantity,
          detailsJson: sql<string>`${requisitionApprovalEvents.eventDataJson}::text`,
          occurredAt: requisitionApprovalEvents.occurredAt,
          eventHash: requisitionApprovalEvents.eventHash,
        })
        .from(requisitionApprovalEvents)
        .innerJoin(requisitions, eq(requisitionApprovalEvents.requisitionId, requisitions.id))
        .innerJoin(projects, eq(requisitions.projectId, projects.id))
        .innerJoin(materials, eq(requisitions.materialId, materials.id))
        .innerJoin(users, eq(requisitionApprovalEvents.actorUserId, users.id))
        .where(reqFilter)
        .orderBy(desc(requisitionApprovalEvents.occurredAt), desc(requisitionApprovalEvents.sequenceNumber))
        .limit(windowSize))
        .map(item => ({
          chainKey: `REQ-${item.requisitionId}`,
          sequenceNumber: item.sequenceNumber,
          requisitionId: item.requisitionId,
          projectId: item.projectId,
          projectName: item.projectName,
          entityType: 'Requisition',
          entityId: item.requisitionId,
          referenceNumber: `MR-${item.requisitionId}`,
          eventType: item.eventType,
          actorName: item.actorName,
          actorRole: item.actorRole,
          materialName: item.materialName,
          materialUnit: item.materialUnit,
          requestedQuantity: item.requestedQuantity,
          eventQuantity: null,
          detailsJson: item.detailsJson,
          occurredAt: item.occurredAt,
          eventHash: item.eventHash,
        }))

      const sourcingFilter = and(
        projectId !== null ? eq(requisitions.projectId, projectId) : undefined,
        effectiveRequisitionId !== null ? eq(sourcingRounds.requisitionId, effectiveRequisitionId) : undefined)
      sourcingCount = await countRows(this.db
        .select({ value: count() })
        .from(sourcingRoundEvents)
        .innerJoin(sourcingRounds, eq(sourcingRoundEvents.sourcingRoundId, sourcingRounds.id))
        .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
        .where(sourcingFilter))
      const sourcingSequence = sql<number>`1000 + ${sourcingRoundEvents.id}::integer`
      sourcingItems = (await this.db
        .select({
          requisitionId: sourcingRounds.requisitionId,
          sequenceNumber: sourcingSequence,
          projectId: requisitions.projectId,
          projectName: projects.name,
          sourcingRoundId: sourcingRoundEvents.sourcingRoundId,
          eventType: sourcingRoundEvents.eventType,
          actorName: users.fullName,
          actorRole: sourcingRoundEvents.actorRole,
          materialName: materials.name,
          materialUnit: materials.unit,
          requestedQuantity: requisitions.quantity,
          notes: sourcingRoundEvents.notes,
          occurredAt: sourcingRoundEvents.occurredAt,
        })
        .from(sourcingRoundEvents)
        .innerJoin(sourcingRounds, eq(sourcingRoundEvents.sourcingRoundId, sourcingRounds.id))
        .innerJoin(requisitions, eq(sourcingRounds.requisitionId, requisitions.id))
        .innerJoin(projects, eq(requisitions.projectId, projects.id))
        .innerJoin(materials, eq(requisitions.materialId, materials.id))
        .innerJoin(users, eq(sourcingRoundEvents.actorUserId, users.id))
        .where(sourcingFilter)
        .orderBy(desc(sourcingRoundEvents.occurredAt), desc(sourcingSequence))
        .limit(windowSize))
        .map(item => ({
          chainKey: `REQ-${item.requisitionId}`,
          sequenceNumber: Number(item.sequenceNumber),
          requisitionId: item.requisitionId,
          projectId: item.projectId,
          projectName: item.projectName,
          entityType: 'SourcingRound',
          entityId: item.sourcingRoundId,
          referenceNumber: `SRC-${item.sourcingRoundId}`,
          eventType: item.eventType,
          actorName: item.actorName,
          actorRole: item.actorRole,
          materialName: item.materialName,
          materialUnit: item.materialUnit,
          requestedQuantity: item.requestedQuantity,
          eventQuantity: null,
          detailsJson: item.notes,
          occurredAt: item.occurredAt,
          eventHash: '',
        }))

      const orderFilter = and(
        projectId !== null ? eq(purchaseOrders.projectId, projectId) : undefined,
        effectiveRequisitionId !== null ? eq(purchaseOrders.requisitionId, effectiveRequisitionId) : undefined)
      orderCount = await countRows(this.db
        .select({ value: count() })
        .from(purchaseOrderEvents)
        .innerJoin(purchaseOrders, eq(purchaseOrderEvents.purchaseOrderId, purchaseOrders.id))
        .where(orderFilter))
      const orderSequence = sql<number>`2000 + ${purchaseOrderEvents.id}::integer`
      orderItems = (await this.db
        .select({
          requisitionId: purchaseOrders.requisitionId,
          sequenceNumber: orderSequence,
          projectId: purchaseOrders.projectId,
          projectName: projects.name,
          purchaseOrderId: purchaseOrderEvents.purchaseOrderId,
          purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
          eventType: purchaseOrderEvents.eventType,
          actorName: users.fullName,
          actorRole: purchaseOrderEvents.actorRole,
          materialName: materials.name,
          materialUnit: materials.unit,
          requestedQuantity: requisitions.quantity,
          detailsJson: purchaseOrderEvents.detailsJson,
          occurredAt: purchaseOrderEvents.occurredAt,
        })
        .from(purchaseOrderEvents)
        .innerJoin(purchaseOrders, eq(purchaseOrderEvents.purchaseOrderId, purchaseOrders.id))
        .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
        .innerJoin(requisitions, eq(purchaseOrders.requisitionId, requisitions.id))
        .innerJoin(materials, eq(requisitions.materialId, materials.id))
        .innerJoin(users, eq(purchaseOrderEvents.actorUserId, users.id))
        .where(orderFilter)
        .orderBy(desc(purchaseOrderEvents.occurredAt), desc(orderSequence))
        .limit(windowSize))
        .map(item => ({
          chainKey: `REQ-${item.requisitionId}`,
          sequenceNumber: Number(item.sequenceNumber),
          requisitionId: item.requisitionId,
          projectId: item.projectId,
          projectName: item.projectName,
          entityType: 'PurchaseOrder',
          entityId: item.purchaseOrderId,
          referenceNumber: item.purchaseOrderNumber,
          eventType: item.eventType,
          actorName: item.actorName,
          actorRole: item.actorRole,
          materialName: item.materialName,
          materialUnit: item.materialUnit,
          requestedQuantity: item.requestedQuantity,
          eventQuantity: null,
          detailsJson: item.detailsJson,
          occurredAt: item.occurredAt,
          eventHash: '',
        }))
    }

    const items = [...requisitionItems, ...sourcingItems, ...orderItems, ...controls]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.sequenceNumber - a.sequenceNumber)
      .slice(pagination.offset, pagination.offset + pagination.pageSize)
    for (const item of items) {
      if (item.entityType !== 'Requisition' && item.entityType !== 'SourcingRound' && item.entityType !== 'PurchaseOrder') {
        item.eventQuantity = readEventQuantity(item.entityType, item.eventType, item.detailsJson)
      }
    }

    return pageOf(items, controlCount + requisitionCount + sourcingCount + orderCount, pagination.page, pagination.pageSize)
  }

  private async appendAuthorizedEventAsync(
    tx: DbExecutor,
    authorization: PaymentAuthorizationRow,
    invoice: SupplierInvoiceRow,
    requisitionId: number,
    actorUserId: number,
    actorRole: string,
    notes: string | null,
    now: Date,
  ): Promise<void> {
    await this.events.appendAsync({
      chainKey: chain(requisitionId),
      requisitionId,
      projectId: invoice.projectId,
      entityType: 'PaymentAuthorization',
      entityId: authorization.id,
      referenceNumber: authorization.authorizationNumber,
      eventType: 'PaymentAuthorized',
      actorUserId,
      actorRole,
      details: { Amount: authorization.amount, notes },
      occurredAt: now,
    }, tx)
  }

  private async loadInvoiceAsync(id: number): Promise<SupplierInvoiceResponseDto> {
    const [invoice] = await loadInvoicesAsync(this.db, eq(supplierInvoices.id, id), { limit: 2 })
    if (!invoice) throw new InvalidOperationError('Sequence contains no elements')
    const authorization = singleOrDefault(await loadAuthorizationsAsync(
      this.db, eq(paymentAuthorizations.supplierInvoiceId, id), { limit: 2 }))
    const payment = authorization === null
      ? null
      : singleOrDefault(await loadPaymentsAsync(this.db, eq(payments.paymentAuthorizationId, authorization.id), { limit: 2 }))
    return toInvoiceDto(invoice, authorization, payment)
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

  private async projectScope(
    actorUserId: number,
    actorRole: string,
    projectColumn: AnyColumn,
  ): Promise<SQL | undefined> {
    if (actorRole === 'CEO' || actorRole === 'Auditor' || await this.canVerifyAllProjectsAsync(actorUserId)) {
      return undefined
    }

    return exists(this.db
      .select({ one: sql`1` })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actorUserId),
        eq(userProjectAssignments.projectId, projectColumn),
        eq(userProjectAssignments.isActive, true))))
  }
}

interface PageOptions {
  orderBy?: SQL[]
  offset?: number
  limit?: number
}

async function countRows(query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query
  return row?.value ?? 0
}

function singleOrDefault<T>(rows: T[]): T | null {
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0] ?? null
}

async function findInvoiceAsync(db: DbExecutor, id: number): Promise<SupplierInvoiceRow> {
  const invoice = singleOrDefault(await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).limit(2))
  if (invoice === null) throw new KeyNotFoundError('The supplier invoice was not found.')
  return invoice
}

async function purchaseOrderRequisitionIdAsync(db: DbExecutor, purchaseOrderId: number): Promise<number> {
  const [order] = await db
    .select({ requisitionId: purchaseOrders.requisitionId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchaseOrderId))
    .limit(1)
  return order!.requisitionId
}

async function insertAuthorizationAsync(
  db: DbExecutor,
  invoice: SupplierInvoiceRow,
  actorUserId: number,
  notes: string | null,
  now: Date,
): Promise<PaymentAuthorizationRow> {
  const [authorization] = await db
    .insert(paymentAuthorizations)
    .values({
      authorizationNumber: reference('AUT', now),
      supplierInvoiceId: invoice.id,
      amount: invoice.amount,
      authorizedByUserId: actorUserId,
      notes,
      authorizedAt: now,
    })
    .returning()
  return authorization!
}

async function resolveCashAccountForPostingAsync(
  db: DbExecutor,
  projectId: number,
  cashAccountId: number | null,
  amount: number,
): Promise<CashAccountRow | null> {
  if (cashAccountId === null) {
    const [existing] = await db
      .select({ id: cashAccounts.id })
      .from(cashAccounts)
      .where(eq(cashAccounts.projectId, projectId))
      .limit(1)
    if (existing) throw new ArgumentError('Select the project cash account used for this payment.', 'cashAccountId')
    return null
  }
  if (cashAccountId <= 0) throw new ArgumentError('Cash-account ID must be positive.', 'cashAccountId')

  const account = singleOrDefault(await db
    .select()
    .from(cashAccounts)
    .where(and(eq(cashAccounts.id, cashAccountId), eq(cashAccounts.projectId, projectId)))
    .for('update'))
  if (account === null) throw new KeyNotFoundError('The selected project cash account was not found.')
  if (dec(account.balance).lt(amount)) {
    throw new InvalidOperationError(
      `The selected cash account has insufficient funds. Available balance: KES ${formatNumber(account.balance)}.`)
  }
  return account
}

/** `.Include(order => order.GoodsReceipts).ThenInclude(receipt => receipt.TechnicalAcceptances)` reduced to what Finance reads. */
async function loadReceiptOutcomesAsync(
  db: DbExecutor,
  purchaseOrderIds: number[],
): Promise<{ purchaseOrderId: number; acceptedQuantity: number; latestOutcome: string | null }[]> {
  if (purchaseOrderIds.length === 0) return []
  return await db
    .select({
      purchaseOrderId: goodsReceipts.purchaseOrderId,
      acceptedQuantity: goodsReceipts.acceptedQuantity,
      latestOutcome: sql<string | null>`(
        SELECT review."Outcome" FROM "GoodsReceiptTechnicalAcceptances" AS review
        WHERE review."GoodsReceiptId" = ${goodsReceipts.id}
        ORDER BY review."ReviewSequence" DESC
        LIMIT 1)`,
    })
    .from(goodsReceipts)
    .where(inArray(goodsReceipts.purchaseOrderId, purchaseOrderIds))
    .orderBy(asc(goodsReceipts.id))
}

function quantityEligibleForInvoice(receipts: { acceptedQuantity: number; latestOutcome: string | null }[]): Decimal {
  return sum(receipts
    .filter(item => item.latestOutcome !== TechnicalAcceptanceOutcomes.Rejected)
    .map(item => item.acceptedQuantity))
}

async function loadInvoicesAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<LoadedInvoice[]> {
  let query = db
    .select({
      invoice: supplierInvoices,
      purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
      requisitionId: purchaseOrders.requisitionId,
      projectName: projects.name,
      supplierName: suppliers.name,
      capturedByName: capturedByUser.fullName,
      reviewedByName: reviewedByUser.fullName,
    })
    .from(supplierInvoices)
    .innerJoin(purchaseOrders, eq(supplierInvoices.purchaseOrderId, purchaseOrders.id))
    .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
    .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .innerJoin(capturedByUser, eq(supplierInvoices.capturedByUserId, capturedByUser.id))
    .leftJoin(reviewedByUser, eq(supplierInvoices.reviewedByUserId, reviewedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const orderIds = [...new Set(rows.map(row => row.invoice.purchaseOrderId))]
  const lines = await db
    .select({
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      quantity: purchaseOrderLines.quantity,
      unitPrice: purchaseOrderLines.unitPrice,
      materialName: materials.name,
      materialUnit: materials.unit,
    })
    .from(purchaseOrderLines)
    .innerJoin(materials, eq(purchaseOrderLines.materialId, materials.id))
    .where(inArray(purchaseOrderLines.purchaseOrderId, orderIds))
    .orderBy(asc(purchaseOrderLines.id))
  const receipts = await loadReceiptOutcomesAsync(db, orderIds)
  return rows.map(row => ({
    ...row,
    lines: lines.filter(line => line.purchaseOrderId === row.invoice.purchaseOrderId),
    receipts: receipts.filter(receipt => receipt.purchaseOrderId === row.invoice.purchaseOrderId),
  }))
}

async function loadAuthorizationsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<PaymentAuthorizationResponseDto[]> {
  let query = db
    .select({
      authorization: paymentAuthorizations,
      projectId: supplierInvoices.projectId,
      invoiceStatus: supplierInvoices.status,
      supplierName: suppliers.name,
      projectName: projects.name,
      authorizedByName: users.fullName,
    })
    .from(paymentAuthorizations)
    .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
    .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
    .innerJoin(users, eq(paymentAuthorizations.authorizedByUserId, users.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(row => ({
    id: row.authorization.id,
    authorizationNumber: row.authorization.authorizationNumber,
    supplierInvoiceId: row.authorization.supplierInvoiceId,
    projectId: row.projectId,
    amount: row.authorization.amount,
    supplierName: row.supplierName,
    projectName: row.projectName,
    authorizedByUserId: row.authorization.authorizedByUserId,
    authorizedByName: row.authorizedByName,
    notes: row.authorization.notes,
    authorizedAt: row.authorization.authorizedAt,
    isPaid: row.invoiceStatus === InvoiceStatuses.Paid,
  }))
}

async function loadPaymentsAsync(db: DbExecutor, filter: SQL | undefined, page: PageOptions): Promise<PaymentResponseDto[]> {
  let query = db
    .select({
      payment: payments,
      paidByName: users.fullName,
      receiptNumber: paymentReceipts.receiptNumber,
    })
    .from(payments)
    .innerJoin(paymentAuthorizations, eq(payments.paymentAuthorizationId, paymentAuthorizations.id))
    .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
    .innerJoin(users, eq(payments.paidByUserId, users.id))
    .leftJoin(paymentReceipts, eq(paymentReceipts.paymentId, payments.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(row => toPaymentDto(row.payment, row.paidByName, row.receiptNumber))
}

function toPaymentDto(item: PaymentRow, paidByName: string, receiptNumber: string | null): PaymentResponseDto {
  return {
    id: item.id,
    paymentNumber: item.paymentNumber,
    displayNumber: `PAY-${item.paidAt.getUTCFullYear()}-${String(item.id).padStart(4, '0')}`,
    paymentAuthorizationId: item.paymentAuthorizationId,
    amount: item.amount,
    method: item.method,
    externalReference: item.externalReference,
    evidenceReference: item.evidenceReference,
    paidByName,
    paidAt: item.paidAt,
    receiptNumber: receiptNumber ?? '',
  }
}

function toInvoiceDto(
  item: LoadedInvoice,
  authorization: PaymentAuthorizationResponseDto | null,
  payment: PaymentResponseDto | null,
): SupplierInvoiceResponseDto {
  const { invoice } = item
  const line = PurchaseOrderInvariant.requireSingleLine({ lines: item.lines })
  const relevantReceipts = item.receipts.filter(receipt =>
    dec(receipt.acceptedQuantity).gt(0) && receipt.latestOutcome !== TechnicalAcceptanceOutcomes.Rejected)
  const accepted = invoice.receivedQuantitySnapshot ?? toNumber(sum(relevantReceipts.map(receipt => receipt.acceptedQuantity)))
  const reviewed = invoice.reviewedAt !== null
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    purchaseOrderId: invoice.purchaseOrderId,
    purchaseOrderNumber: item.purchaseOrderNumber,
    requisitionId: item.requisitionId,
    projectId: invoice.projectId,
    projectName: item.projectName,
    supplierId: invoice.supplierId,
    supplierName: item.supplierName,
    materialName: line.materialName,
    materialUnit: line.materialUnit,
    orderedQuantity: line.quantity,
    orderedUnitPrice: line.unitPrice,
    acceptedQuantity: accepted,
    quantity: invoice.quantity,
    unitPrice: invoice.unitPrice,
    amount: invoice.amount,
    documentReference: invoice.documentReference,
    status: invoice.status,
    quantityMatches: reviewed && dec(invoice.quantity).eq(accepted),
    priceMatches: reviewed && dec(invoice.unitPrice).eq(line.unitPrice),
    amountMatches: reviewed && dec(invoice.amount).eq(roundAwayFromZero(dec(invoice.quantity).times(invoice.unitPrice), 2)),
    requiresTechnicalAcceptance: false,
    technicalAcceptanceStatus: 'NotRequired',
    technicalAcceptanceRequiredCount: 0,
    technicalAcceptanceAcceptedCount: 0,
    technicalAcceptanceRejectedCount: 0,
    latestTechnicalReviewerName: null,
    latestTechnicalReviewAt: null,
    requiresCeoApproval: dec(invoice.amount).gt(FinanceWorkflowService.CeoExceptionThreshold),
    matchNotes: invoice.matchNotes,
    capturedByName: item.capturedByName,
    capturedAt: invoice.capturedAt,
    reviewedByUserId: invoice.reviewedByUserId,
    reviewedByName: item.reviewedByName,
    reviewedAt: invoice.reviewedAt,
    ceoDecision: invoice.ceoDecision,
    ceoDecisionNotes: invoice.ceoDecisionNotes,
    ceoDecisionAt: invoice.ceoDecisionAt,
    authorization,
    payment,
  }
}

function readEventQuantity(entityType: string, eventType: string, detailsJson: string | null): number | null {
  let propertyName: string | null = null
  if (entityType === 'GoodsReceipt' && eventType === 'GoodsReceived') propertyName = 'accepted'
  else if (entityType === 'GoodsReceiptTechnicalAcceptance') propertyName = 'quantity'
  else if (entityType === 'MaterialIssue' && eventType === 'MaterialIssued') propertyName = 'quantity'
  else if (entityType === 'MaterialIssue' && (eventType === 'MaterialReceiptConfirmed' || eventType === 'MaterialReceiptDisputed')) {
    propertyName = 'received'
  } else if (entityType === 'MaterialUsage') propertyName = 'quantity'
  else if (entityType === 'SupplierInvoice' && eventType === 'InvoiceCaptured') propertyName = 'quantity'
  if (propertyName === null || detailsJson === null || detailsJson.trim() === '') return null

  try {
    const document = JSON.parse(detailsJson) as unknown
    if (document === null || typeof document !== 'object' || Array.isArray(document)) return null
    for (const [name, value] of Object.entries(document)) {
      if (name.toUpperCase() === propertyName.toUpperCase() && typeof value === 'number') return value
    }
  } catch {
    // Older imported events may contain plain-text notes rather than JSON.
  }

  return null
}

/** `$"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..30]` */
function reference(prefix: string, now: Date): string {
  const iso = now.toISOString()
  return `${prefix}-${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${randomUUID().replace(/-/g, '')}`.slice(0, 30)
}

function chain(requisitionId: number): string {
  return `REQ-${requisitionId}`
}

function normalizeChainKey(chainKey: string | null): string | null {
  if (chainKey === null) return null
  const normalized = chainKey.trim()
  if (normalized.length < 3 || normalized.length > 80) {
    throw new ArgumentError('Chain key must be between 3 and 80 characters.', 'chainKey')
  }

  const separator = normalized.lastIndexOf('-')
  const prefix = separator > 0 ? normalized.slice(0, separator) : ''
  const idText = separator > 0 ? normalized.slice(separator + 1) : ''
  if (prefix.length === 0
    || !/^[A-Z][A-Z0-9]*$/.test(prefix)
    || idText.length === 0
    || idText[0] === '0'
    || !/^[0-9]+$/.test(idText)
    || BigInt(idText) > 9_223_372_036_854_775_807n) {
    throw new ArgumentError('Chain key must use the format PREFIX-ID, for example REQ-42 or TRF-7.', 'chainKey')
  }

  return normalized
}

function pageOf<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return createPaginatedResult({ items, totalCount: total, page, pageSize })
}
