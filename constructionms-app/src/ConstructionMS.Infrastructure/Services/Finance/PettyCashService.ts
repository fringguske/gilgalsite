import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, exists, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  ArgumentError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, formatNumber, toNumber } from '@/ConstructionMS.Application/Common/Money'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  ConfirmPettyCashReceiptDto,
  CreatePettyCashRequestDto,
  DecidePettyCashRequestDto,
  DisbursePettyCashRequestDto,
  PettyCashRequestResponseDto,
  ReviewPettyCashReconciliationDto,
  SubmitPettyCashReconciliationDto,
} from '@/ConstructionMS.Application/DTOs/Finance/PettyCashDtos'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IPettyCashService } from '@/ConstructionMS.Application/Services/Finance/IPettyCashService'
import { PettyCashReconciliationStatuses, PettyCashStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  cashAccounts,
  cashLedgerEntries,
  costCodes,
  payments,
  pettyCashDisbursements,
  pettyCashReceiptConfirmations,
  pettyCashReconciliationEvents,
  pettyCashReconciliations,
  pettyCashRequests,
  projects,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { ControlEventWriter } from '../ControlEventWriter'
import { BudgetCommitmentGuard } from './BudgetCommitmentGuard'

type PettyCashRequestRow = typeof pettyCashRequests.$inferSelect
type CashAccountRow = typeof cashAccounts.$inferSelect

const Serializable = { isolationLevel: IsolationLevel.Serializable } as const

const requestedByUser = alias(users, 'requested_by_user')
const financeApprovedByUser = alias(users, 'finance_approved_by_user')

export class PettyCashService implements IPettyCashService {
  static readonly RequestLimit = 100_000

  private readonly events: ControlEventWriter

  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
  ) {
    this.events = new ControlEventWriter(db)
  }

  async getRequestsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
    status: string | null = null,
  ): Promise<PaginatedResult<PettyCashRequestResponseDto>> {
    const actor = await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    const filter = and(
      actor.effectiveRole !== 'CEO' && actor.effectiveRole !== 'Auditor' && !actor.canSwitchRoles
        ? exists(this.db
          .select({ one: sql`1` })
          .from(userProjectAssignments)
          .where(and(
            eq(userProjectAssignments.userId, actor.userId),
            eq(userProjectAssignments.projectId, pettyCashRequests.projectId),
            eq(userProjectAssignments.isActive, true))))
        : undefined,
      projectId !== null ? eq(pettyCashRequests.projectId, projectId) : undefined,
      status !== null && status.trim() !== '' ? eq(pettyCashRequests.status, status.trim()) : undefined)
    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: total } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(pettyCashRequests)
      .where(filter)
    const items = await loadRequestsAsync(this.db, filter, {
      orderBy: [desc(pettyCashRequests.requestedAt), desc(pettyCashRequests.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    return createPaginatedResult({ items, totalCount: total, page: pagination.page, pageSize: pagination.pageSize })
  }

  async createRequestAsync(
    request: CreatePettyCashRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor')
    const amount = InputNormalizer.positive(request.amount, 'Amount', 18, 2)
    if (dec(amount).gt(PettyCashService.RequestLimit)) {
      throw new ArgumentError(
        `Petty cash is limited to KES ${formatNumber(PettyCashService.RequestLimit, 0)}; use procurement for larger spending.`)
    }
    const purpose = InputNormalizer.requiredText(request.purpose, 'Purpose', 3, 500)
    if (request.neededByDate < utcToday()) throw new ArgumentError('Needed-by date cannot be in the past.')
    await this.requireProjectAccessAsync(this.db, actorUserId, request.projectId)
    if (await this.hasUnreconciledRequestAsync(actorUserId)) {
      throw new InvalidOperationError('Reconcile or close your existing petty-cash request before requesting another float.')
    }
    const [validCostCode] = await this.db
      .select({ id: costCodes.id })
      .from(costCodes)
      .where(and(
        eq(costCodes.id, request.costCodeId),
        eq(costCodes.projectId, request.projectId),
        eq(costCodes.isActive, true)))
      .limit(1)
    if (!validCostCode) throw new ArgumentError('Select an active budget area for this project.')
    const id = await this.db.transaction(async (tx) => {
      const now = new Date()
      const [item] = await tx
        .insert(pettyCashRequests)
        .values({
          requestNumber: reference('PCR', now),
          projectId: request.projectId,
          costCodeId: request.costCodeId,
          purpose,
          amountRequested: amount,
          neededByDate: request.neededByDate,
          requestedByUserId: actorUserId,
          requestedAt: now,
          status: PettyCashStatuses.PendingFinanceApproval,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: chain(item!.id),
        requisitionId: null,
        projectId: item!.projectId,
        entityType: 'PettyCashRequest',
        entityId: item!.id,
        referenceNumber: item!.requestNumber,
        eventType: 'PettyCashRequested',
        actorUserId,
        actorRole,
        details: { amount, CostCodeId: item!.costCodeId, purpose, NeededByDate: item!.neededByDate },
        occurredAt: now,
      }, tx)
      return item!.id
    }, Serializable)
    return await this.loadAsync(id)
  }

  async decideRequestAsync(
    id: number,
    request: DecidePettyCashRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Finance Officer')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM "Projects" project JOIN "PettyCashRequests" request ON request."ProjectId" = project."Id" WHERE request."Id" = ${id} FOR UPDATE OF project`)
      const item = await findRequestAsync(tx, id)
      if (item.status !== PettyCashStatuses.PendingFinanceApproval) {
        throw new InvalidOperationError('This petty-cash request has already been decided.')
      }
      if (item.requestedByUserId === actorUserId) throw new UnauthorizedAccessError('The requester cannot approve petty cash.')
      await this.requireProjectAccessAsync(tx, actorUserId, item.projectId)
      let approvedAmount: number | null = null
      if (request.approve) {
        approvedAmount = InputNormalizer.positive(request.amountApproved ?? item.amountRequested, 'AmountApproved', 18, 2)
        if (dec(approvedAmount).gt(item.amountRequested)) {
          throw new ArgumentError('Approved amount cannot exceed the requested amount.')
        }
        await BudgetCommitmentGuard.ensureAvailableAsync(tx, item.projectId, item.costCodeId, approvedAmount, null, item.id)
      }
      const now = new Date()
      await tx
        .update(pettyCashRequests)
        .set({
          amountApproved: approvedAmount,
          amountCommitted: approvedAmount,
          financeApprovedByUserId: actorUserId,
          financeDecisionAt: now,
          financeDecisionNotes: notes,
          status: request.approve ? PettyCashStatuses.Approved : PettyCashStatuses.Rejected,
        })
        .where(eq(pettyCashRequests.id, item.id))
      await this.events.appendAsync({
        chainKey: chain(item.id),
        requisitionId: null,
        projectId: item.projectId,
        entityType: 'PettyCashRequest',
        entityId: item.id,
        referenceNumber: item.requestNumber,
        eventType: request.approve ? 'PettyCashApproved' : 'PettyCashRejected',
        actorUserId,
        actorRole,
        details: { amountRequested: item.amountRequested, approvedAmount, notes },
        occurredAt: now,
      }, tx)
    }, { isolationLevel: IsolationLevel.ReadCommitted })
    return await this.loadAsync(id)
  }

  async disburseAsync(
    id: number,
    request: DisbursePettyCashRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Finance Officer')
    const method = InputNormalizer.requiredText(request.method, 'Method', 1, 30)
    if (method !== 'MPesa' && method !== 'BankTransfer' && method !== 'Cheque' && method !== 'Cash') {
      throw new ArgumentError('Method must be MPesa, BankTransfer, Cheque, or Cash.')
    }
    const externalReference = InputNormalizer.requiredText(request.externalReference, 'ExternalReference', 3, 100).toUpperCase()
    const recipient = InputNormalizer.requiredText(request.recipientName, 'RecipientName', 3, 150)
    const acknowledgement = InputNormalizer.requiredText(
      request.recipientAcknowledgementReference, 'RecipientAcknowledgementReference', 3, 500)
    const evidence = InputNormalizer.requiredText(request.evidenceReference, 'EvidenceReference', 3, 500)
    await this.db.transaction(async (tx) => {
      const item = await findRequestAsync(tx, id)
      if (item.status !== PettyCashStatuses.Approved || item.amountApproved === null) {
        throw new InvalidOperationError('Finance has not approved this petty-cash request for disbursement.')
      }
      if (item.requestedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The requester cannot execute this disbursement.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, item.projectId)
      const cashAccount = await resolveCashAccountForPostingAsync(tx, item.projectId, request.cashAccountId, item.amountApproved)
      const [alreadyDisbursed] = await tx
        .select({ id: pettyCashDisbursements.id })
        .from(pettyCashDisbursements)
        .where(eq(pettyCashDisbursements.pettyCashRequestId, item.id))
        .limit(1)
      if (alreadyDisbursed) throw new InvalidOperationError('This petty-cash request has already been disbursed.')
      const [disbursementReference] = await tx
        .select({ id: pettyCashDisbursements.id })
        .from(pettyCashDisbursements)
        .where(eq(pettyCashDisbursements.externalReference, externalReference))
        .limit(1)
      const [paymentReference] = disbursementReference
        ? [disbursementReference]
        : await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.externalReference, externalReference))
          .limit(1)
      if (paymentReference) throw new InvalidOperationError('That payment reference is already recorded.')
      const now = new Date()
      const [disbursement] = await tx
        .insert(pettyCashDisbursements)
        .values({
          disbursementNumber: reference('PCD', now),
          pettyCashRequestId: item.id,
          amount: item.amountApproved,
          method,
          externalReference,
          recipientName: recipient,
          recipientAcknowledgementReference: acknowledgement,
          evidenceReference: evidence,
          disbursedByUserId: actorUserId,
          disbursedAt: now,
        })
        .returning()
      await tx.update(pettyCashRequests).set({ status: PettyCashStatuses.Disbursed }).where(eq(pettyCashRequests.id, item.id))
      if (cashAccount !== null) {
        const balance = dec(cashAccount.balance).minus(disbursement!.amount)
        await tx
          .update(cashAccounts)
          .set({ balance: toNumber(balance), updatedAt: now })
          .where(eq(cashAccounts.id, cashAccount.id))
        await tx.insert(cashLedgerEntries).values({
          entryNumber: reference('CASH', now),
          cashAccountId: cashAccount.id,
          projectId: item.projectId,
          amountDelta: toNumber(dec(disbursement!.amount).negated()),
          balanceAfter: toNumber(balance),
          entryType: 'PettyCashDisbursement',
          referenceType: 'PettyCashDisbursement',
          referenceId: disbursement!.id,
          referenceNumber: disbursement!.disbursementNumber,
          postedByUserId: actorUserId,
          postedAt: now,
          notes: item.purpose,
        })
      }
      await this.events.appendAsync({
        chainKey: chain(item.id),
        requisitionId: null,
        projectId: item.projectId,
        entityType: 'PettyCashDisbursement',
        entityId: disbursement!.id,
        referenceNumber: disbursement!.disbursementNumber,
        eventType: 'PettyCashDisbursed',
        actorUserId,
        actorRole,
        details: {
          Amount: disbursement!.amount,
          method,
          reference: externalReference,
          recipient,
          acknowledgement,
          evidence,
          cashAccountId: cashAccount?.id ?? null,
          cashAccountName: cashAccount?.name ?? null,
        },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadAsync(id)
  }

  async confirmReceiptAsync(
    id: number,
    request: ConfirmPettyCashReceiptDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor')
    const amountReceived = InputNormalizer.positive(request.amountReceived, 'AmountReceived', 18, 2)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 500)
    await this.db.transaction(async (tx) => {
      const item = await findRequestAsync(tx, id)
      const disbursement = await findDisbursementAsync(tx, item.id)
      if (item.status !== PettyCashStatuses.Disbursed || disbursement === null) {
        throw new InvalidOperationError('Only a recorded petty-cash handover can be confirmed.')
      }
      if (item.requestedByUserId !== actorUserId) {
        throw new UnauthorizedAccessError('The requesting Supervisor must confirm receipt.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, item.projectId)
      if (!dec(amountReceived).eq(disbursement.amount)) {
        throw new ArgumentError(
          'The received amount must equal the recorded handover amount. Ask Finance to resolve any difference before confirming.')
      }
      const [existing] = await tx
        .select({ id: pettyCashReceiptConfirmations.id })
        .from(pettyCashReceiptConfirmations)
        .where(or(
          eq(pettyCashReceiptConfirmations.pettyCashRequestId, item.id),
          eq(pettyCashReceiptConfirmations.pettyCashDisbursementId, disbursement.id)))
        .limit(1)
      if (existing) throw new InvalidOperationError('Receipt of this petty-cash handover has already been confirmed.')
      const now = new Date()
      const [confirmation] = await tx
        .insert(pettyCashReceiptConfirmations)
        .values({
          confirmationNumber: reference('PCRC', now),
          pettyCashRequestId: item.id,
          pettyCashDisbursementId: disbursement.id,
          amountReceived,
          notes,
          confirmedByUserId: actorUserId,
          confirmedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: chain(item.id),
        requisitionId: null,
        projectId: item.projectId,
        entityType: 'PettyCashReceiptConfirmation',
        entityId: confirmation!.id,
        referenceNumber: confirmation!.confirmationNumber,
        eventType: 'PettyCashReceiptConfirmed',
        actorUserId,
        actorRole,
        details: { amountReceived, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadAsync(id)
  }

  async submitReconciliationAsync(
    id: number,
    request: SubmitPettyCashReconciliationDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Supervisor')
    const spent = InputNormalizer.nonNegative(request.amountSpent, 'AmountSpent', 18, 2)
    const returned = InputNormalizer.nonNegative(request.amountReturned, 'AmountReturned', 18, 2)
    const evidence = InputNormalizer.requiredText(request.evidenceReference, 'EvidenceReference', 3, 500)
    const returnReference = InputNormalizer.optionalText(request.returnReference, 'ReturnReference', 100)
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      const item = await findRequestAsync(tx, id)
      const disbursement = await findDisbursementAsync(tx, item.id)
      const [receiptConfirmation] = await tx
        .select({ id: pettyCashReceiptConfirmations.id })
        .from(pettyCashReceiptConfirmations)
        .where(eq(pettyCashReceiptConfirmations.pettyCashRequestId, item.id))
        .limit(1)
      const reconciliations = await tx
        .select({ status: pettyCashReconciliations.status })
        .from(pettyCashReconciliations)
        .where(eq(pettyCashReconciliations.pettyCashRequestId, item.id))
      if (item.status !== PettyCashStatuses.Disbursed) throw new InvalidOperationError('Only disbursed petty cash can be reconciled.')
      if (item.requestedByUserId !== actorUserId) {
        throw new UnauthorizedAccessError('The requesting Supervisor must submit the accountability evidence.')
      }
      if (disbursement === null) throw new InvalidOperationError('No petty-cash disbursement exists.')
      if (!receiptConfirmation) {
        throw new InvalidOperationError('Confirm receipt of the petty cash before submitting receipts and returned funds.')
      }
      if (reconciliations.some(candidate => candidate.status === PettyCashReconciliationStatuses.Approved)) {
        throw new InvalidOperationError('This petty-cash request has already been reconciled.')
      }
      if (!dec(spent).plus(returned).eq(disbursement.amount)) {
        throw new ArgumentError('Amount spent plus amount returned must equal the disbursed amount.')
      }
      if (dec(returned).gt(0) && (returnReference === null || returnReference.trim() === '')) {
        throw new ArgumentError('A cash-return reference is required when money is returned.')
      }
      const now = new Date()
      const [reconciliation] = await tx
        .insert(pettyCashReconciliations)
        .values({
          reconciliationNumber: reference('PCRN', now),
          pettyCashRequestId: item.id,
          amountSpent: spent,
          amountReturned: returned,
          evidenceReference: evidence,
          returnReference,
          notes,
          submittedByUserId: actorUserId,
          submittedAt: now,
          status: PettyCashReconciliationStatuses.PendingReview,
        })
        .returning()
      await tx
        .update(pettyCashRequests)
        .set({ status: PettyCashStatuses.ReconciliationSubmitted })
        .where(eq(pettyCashRequests.id, item.id))
      await this.events.appendAsync({
        chainKey: chain(item.id),
        requisitionId: null,
        projectId: item.projectId,
        entityType: 'PettyCashReconciliation',
        entityId: reconciliation!.id,
        referenceNumber: reconciliation!.reconciliationNumber,
        eventType: 'PettyCashAccountabilitySubmitted',
        actorUserId,
        actorRole,
        details: { spent, returned, evidence, returnReference, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadAsync(id)
  }

  async reviewReconciliationAsync(
    id: number,
    request: ReviewPettyCashReconciliationDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<PettyCashRequestResponseDto> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Finance Officer')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      const item = await findRequestAsync(tx, id)
      const disbursement = await findDisbursementAsync(tx, item.id)
      if (item.status !== PettyCashStatuses.ReconciliationSubmitted) {
        throw new InvalidOperationError('No petty-cash reconciliation is awaiting review.')
      }
      const pending = await tx
        .select()
        .from(pettyCashReconciliations)
        .where(and(
          eq(pettyCashReconciliations.pettyCashRequestId, item.id),
          eq(pettyCashReconciliations.status, PettyCashReconciliationStatuses.PendingReview)))
        .limit(2)
      if (pending.length !== 1) {
        throw new InvalidOperationError(pending.length === 0
          ? 'Sequence contains no matching element'
          : 'Sequence contains more than one matching element')
      }
      const reconciliation = pending[0]!
      if (reconciliation.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The person submitting evidence cannot review it.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, item.projectId)
      let returnAccount: CashAccountRow | null = null
      if (request.approve && dec(reconciliation.amountReturned).gt(0) && disbursement !== null) {
        const sourceEntries = await tx
          .select({ cashAccountId: cashLedgerEntries.cashAccountId })
          .from(cashLedgerEntries)
          .where(and(
            eq(cashLedgerEntries.referenceType, 'PettyCashDisbursement'),
            eq(cashLedgerEntries.referenceId, disbursement.id),
            eq(cashLedgerEntries.entryType, 'PettyCashDisbursement')))
          .limit(2)
        if (sourceEntries.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
        const sourceEntry = sourceEntries[0]
        if (sourceEntry) {
          const accounts = await tx
            .select()
            .from(cashAccounts)
            .where(eq(cashAccounts.id, sourceEntry.cashAccountId))
            .for('update')
          if (accounts.length !== 1) {
            throw new InvalidOperationError(accounts.length === 0
              ? 'Sequence contains no elements'
              : 'Sequence contains more than one element')
          }
          returnAccount = accounts[0]!
        }
      }
      const now = new Date()
      await tx
        .update(pettyCashReconciliations)
        .set({
          status: request.approve ? PettyCashReconciliationStatuses.Approved : PettyCashReconciliationStatuses.Returned,
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          reviewNotes: notes,
          amountExpensed: request.approve ? reconciliation.amountSpent : null,
        })
        .where(eq(pettyCashReconciliations.id, reconciliation.id))
      if (request.approve && returnAccount !== null) {
        const balance = dec(returnAccount.balance).plus(reconciliation.amountReturned)
        await tx
          .update(cashAccounts)
          .set({ balance: toNumber(balance), updatedAt: now })
          .where(eq(cashAccounts.id, returnAccount.id))
        await tx.insert(cashLedgerEntries).values({
          entryNumber: reference('CASH', now),
          cashAccountId: returnAccount.id,
          projectId: item.projectId,
          amountDelta: reconciliation.amountReturned,
          balanceAfter: toNumber(balance),
          entryType: 'CashReturn',
          referenceType: 'PettyCashReconciliation',
          referenceId: reconciliation.id,
          referenceNumber: reconciliation.reconciliationNumber,
          postedByUserId: actorUserId,
          postedAt: now,
          notes: reconciliation.returnReference,
        })
      }
      await tx.insert(pettyCashReconciliationEvents).values({
        pettyCashReconciliationId: reconciliation.id,
        eventType: request.approve ? 'Approved' : 'Returned',
        actorUserId,
        actorRole,
        notes,
        occurredAt: now,
      })
      await tx
        .update(pettyCashRequests)
        .set(request.approve
          ? { amountCommitted: reconciliation.amountSpent, status: PettyCashStatuses.Reconciled }
          : { status: PettyCashStatuses.Disbursed })
        .where(eq(pettyCashRequests.id, item.id))
      await this.events.appendAsync({
        chainKey: chain(item.id),
        requisitionId: null,
        projectId: item.projectId,
        entityType: 'PettyCashReconciliation',
        entityId: reconciliation.id,
        referenceNumber: reconciliation.reconciliationNumber,
        eventType: request.approve ? 'PettyCashReconciled' : 'PettyCashAccountabilityReturned',
        actorUserId,
        actorRole,
        details: { notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadAsync(id)
  }

  private async loadAsync(id: number): Promise<PettyCashRequestResponseDto> {
    const [item] = await loadRequestsAsync(this.db, eq(pettyCashRequests.id, id), { limit: 2 })
    if (!item) throw new InvalidOperationError('Sequence contains no elements')
    return item
  }

  private async requireAnyRoleAsync(userId: number, claimedRole: string, ...allowed: string[]): Promise<ActorRoleContext> {
    const actor = await this.roles.resolveAsync(userId)
    if (actor === null || actor.effectiveRole !== claimedRole || !allowed.includes(actor.effectiveRole)) {
      throw new UnauthorizedAccessError(`This action requires one of these roles: ${allowed.join(', ')}.`)
    }
    return actor
  }

  private async requireProjectAccessAsync(db: DbExecutor, userId: number, projectId: number): Promise<void> {
    const actor = await this.roles.resolveAsync(userId)
    if (actor === null) throw new UnauthorizedAccessError('The active account could not be verified.')
    if (actor.canSwitchRoles || actor.effectiveRole === 'CEO' || actor.effectiveRole === 'Auditor') return
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

  private async hasUnreconciledRequestAsync(userId: number): Promise<boolean> {
    const [open] = await this.db
      .select({ id: pettyCashRequests.id })
      .from(pettyCashRequests)
      .where(and(
        eq(pettyCashRequests.requestedByUserId, userId),
        ne(pettyCashRequests.status, PettyCashStatuses.Reconciled),
        ne(pettyCashRequests.status, PettyCashStatuses.Rejected)))
      .limit(1)
    return open !== undefined
  }
}

async function findRequestAsync(db: DbExecutor, id: number): Promise<PettyCashRequestRow> {
  const rows = await db.select().from(pettyCashRequests).where(eq(pettyCashRequests.id, id)).limit(2)
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  if (rows.length === 0) throw new KeyNotFoundError('The petty-cash request was not found.')
  return rows[0]!
}

async function findDisbursementAsync(db: DbExecutor, requestId: number) {
  const [disbursement] = await db
    .select()
    .from(pettyCashDisbursements)
    .where(eq(pettyCashDisbursements.pettyCashRequestId, requestId))
    .limit(1)
  return disbursement ?? null
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
    if (existing) throw new ArgumentError('Select the project cash account used for this handover.', 'cashAccountId')
    return null
  }
  if (cashAccountId <= 0) throw new ArgumentError('Cash-account ID must be positive.', 'cashAccountId')

  const accounts = await db
    .select()
    .from(cashAccounts)
    .where(and(eq(cashAccounts.id, cashAccountId), eq(cashAccounts.projectId, projectId)))
    .for('update')
  if (accounts.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  const account = accounts[0]
  if (!account) throw new KeyNotFoundError('The selected project cash account was not found.')
  if (dec(account.balance).lt(amount)) {
    throw new InvalidOperationError(
      `The selected cash account has insufficient funds. Available balance: KES ${formatNumber(account.balance)}.`)
  }
  return account
}

/** RequestQuery(): the request with project, cost code, people, disbursement, confirmation and reconciliations. */
async function loadRequestsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: { orderBy?: SQL[]; offset?: number; limit?: number },
): Promise<PettyCashRequestResponseDto[]> {
  let query = db
    .select({
      request: pettyCashRequests,
      projectName: projects.name,
      costCode: costCodes.code,
      costCodeName: costCodes.name,
      requestedByName: requestedByUser.fullName,
      financeApprovedByName: financeApprovedByUser.fullName,
    })
    .from(pettyCashRequests)
    .innerJoin(projects, eq(pettyCashRequests.projectId, projects.id))
    .innerJoin(costCodes, eq(pettyCashRequests.costCodeId, costCodes.id))
    .innerJoin(requestedByUser, eq(pettyCashRequests.requestedByUserId, requestedByUser.id))
    .leftJoin(financeApprovedByUser, eq(pettyCashRequests.financeApprovedByUserId, financeApprovedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.request.id)
  const disbursements = await db
    .select({ disbursement: pettyCashDisbursements, disbursedByName: users.fullName })
    .from(pettyCashDisbursements)
    .innerJoin(users, eq(pettyCashDisbursements.disbursedByUserId, users.id))
    .where(inArray(pettyCashDisbursements.pettyCashRequestId, ids))
  const confirmations = await db
    .select({ confirmation: pettyCashReceiptConfirmations, confirmedByName: users.fullName })
    .from(pettyCashReceiptConfirmations)
    .innerJoin(users, eq(pettyCashReceiptConfirmations.confirmedByUserId, users.id))
    .where(inArray(pettyCashReceiptConfirmations.pettyCashRequestId, ids))
  const submittedBy = alias(users, 'submitted_by_user')
  const reviewedBy = alias(users, 'reviewed_by_user')
  const reconciliations = await db
    .select({
      reconciliation: pettyCashReconciliations,
      submittedByName: submittedBy.fullName,
      reviewedByName: reviewedBy.fullName,
    })
    .from(pettyCashReconciliations)
    .innerJoin(submittedBy, eq(pettyCashReconciliations.submittedByUserId, submittedBy.id))
    .leftJoin(reviewedBy, eq(pettyCashReconciliations.reviewedByUserId, reviewedBy.id))
    .where(inArray(pettyCashReconciliations.pettyCashRequestId, ids))

  return rows.map(({ request: item, ...names }) => {
    const disbursement = disbursements.find(entry => entry.disbursement.pettyCashRequestId === item.id) ?? null
    const confirmation = confirmations.find(entry => entry.confirmation.pettyCashRequestId === item.id) ?? null
    const latest = reconciliations
      .filter(entry => entry.reconciliation.pettyCashRequestId === item.id)
      .reduce<(typeof reconciliations)[number] | null>((current, entry) =>
        current === null || entry.reconciliation.submittedAt.getTime() > current.reconciliation.submittedAt.getTime()
          ? entry
          : current, null)
    return {
      id: item.id,
      requestNumber: item.requestNumber,
      projectId: item.projectId,
      projectName: names.projectName,
      costCodeId: item.costCodeId,
      costCode: names.costCode,
      costCodeName: names.costCodeName,
      purpose: item.purpose,
      amountRequested: item.amountRequested,
      amountApproved: item.amountApproved,
      amountCommitted: item.amountCommitted,
      neededByDate: item.neededByDate,
      status: item.status,
      requestedByName: names.requestedByName,
      requestedByUserId: item.requestedByUserId,
      requestedAt: item.requestedAt,
      financeApprovedByUserId: item.financeApprovedByUserId,
      financeApprovedByName: names.financeApprovedByName,
      financeDecisionAt: item.financeDecisionAt,
      financeDecisionNotes: item.financeDecisionNotes,
      disbursement: disbursement === null
        ? null
        : {
            id: disbursement.disbursement.id,
            disbursementNumber: disbursement.disbursement.disbursementNumber,
            amount: disbursement.disbursement.amount,
            method: disbursement.disbursement.method,
            externalReference: disbursement.disbursement.externalReference,
            recipientName: disbursement.disbursement.recipientName,
            recipientAcknowledgementReference: disbursement.disbursement.recipientAcknowledgementReference,
            evidenceReference: disbursement.disbursement.evidenceReference,
            disbursedByUserId: disbursement.disbursement.disbursedByUserId,
            disbursedByName: disbursement.disbursedByName,
            disbursedAt: disbursement.disbursement.disbursedAt,
          },
      receiptConfirmation: confirmation === null
        ? null
        : {
            id: confirmation.confirmation.id,
            confirmationNumber: confirmation.confirmation.confirmationNumber,
            amountReceived: confirmation.confirmation.amountReceived,
            notes: confirmation.confirmation.notes,
            confirmedByUserId: confirmation.confirmation.confirmedByUserId,
            confirmedByName: confirmation.confirmedByName,
            confirmedAt: confirmation.confirmation.confirmedAt,
          },
      latestReconciliation: latest === null
        ? null
        : {
            id: latest.reconciliation.id,
            reconciliationNumber: latest.reconciliation.reconciliationNumber,
            amountSpent: latest.reconciliation.amountSpent,
            amountReturned: latest.reconciliation.amountReturned,
            amountUnaccounted: toNumber(dec(disbursement?.disbursement.amount ?? 0)
              .minus(latest.reconciliation.amountSpent)
              .minus(latest.reconciliation.amountReturned)),
            amountExpensed: latest.reconciliation.amountExpensed,
            evidenceReference: latest.reconciliation.evidenceReference,
            returnReference: latest.reconciliation.returnReference,
            notes: latest.reconciliation.notes,
            submittedByName: latest.submittedByName,
            submittedAt: latest.reconciliation.submittedAt,
            status: latest.reconciliation.status,
            reviewedByName: latest.reviewedByName,
            reviewedAt: latest.reconciliation.reviewedAt,
            reviewNotes: latest.reconciliation.reviewNotes,
          },
    }
  })
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/** `$"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..30]` */
function reference(prefix: string, now: Date): string {
  const iso = now.toISOString()
  return `${prefix}-${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${randomUUID().replace(/-/g, '')}`.slice(0, 30)
}

function chain(id: number): string {
  return `PETTY-${id}`
}
