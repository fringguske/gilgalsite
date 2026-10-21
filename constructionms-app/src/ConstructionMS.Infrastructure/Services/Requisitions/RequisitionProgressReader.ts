import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { dec, Decimal, sum } from '@/ConstructionMS.Application/Common/Money'
import type {
  RequisitionProgressDto,
  RequisitionProgressStepDto,
} from '@/ConstructionMS.Application/DTOs/Requisitions/V1/RequisitionProgressDto'
import { CustodyCloseoutStatuses, MaterialReturnStatuses } from '@/ConstructionMS.Domain/Entities/ControlWorkspaceEntities'
import { MaterialIssueStatuses, TechnicalAcceptanceOutcomes } from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import {
  PurchaseOrderWorkflowStates,
  SourcingRoundWorkflowStates,
} from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionTypes } from '@/ConstructionMS.Domain/Entities/Requisition'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import type { DbExecutor } from '../../Data/AppDbContext'
import {
  goodsReceipts,
  materialCustodyCloseoutDecisions,
  materialCustodyCloseouts,
  materialIssueDisputeResolutions,
  materialIssues,
  materialReturns,
  materialUsageRecords,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
  sourcingRounds,
  stockBalances,
  users,
} from '../../Data/schema'

/** The loaded requisition fields the journey is built from. */
export interface ProgressSource {
  requisition: typeof requisitions.$inferSelect
  materialUnit: string | null
  requestedByUserName: string | null
  approvedByUserName: string | null
  approvalEvents: { eventType: string; comments: string | null; occurredAt: Date }[]
}

export interface ProgressVisibility {
  /** Who did each step; the CEO/Auditor approval-history rule. */
  names: boolean
  /** Supervisor reasons for returning or rejecting, and close-out review notes. */
  notes: boolean
}

type Round = Awaited<ReturnType<typeof loadRoundsAsync>>[number]
type Order = Awaited<ReturnType<typeof loadOrdersAsync>>[number]

/** A requisition's issue voucher with everything recorded against it on site. */
interface IssueRecord {
  issue: typeof materialIssues.$inferSelect
  used: Decimal
  wasted: Decimal
  returned: Decimal
  pendingReturn: { quantity: Decimal; since: Date } | null
  resolution: {
    foremanReceivedQuantity: number
    returnedToStoreQuantity: number
    resolvedByUserId: number
    resolvedAt: Date
  } | null
  /** The latest close-out revision and its decision, if any. */
  closeout: {
    closeoutNumber: string
    status: string
    submittedAt: Date
    decidedByUserId: number | null
    decisionNotes: string | null
    decidedAt: Date | null
  } | null
}

interface Related {
  rounds: Map<number, Round[]>
  orders: Map<number, Order[]>
  issues: Map<number, IssueRecord>
  balances: Map<string, number>
  userNames: Map<number, string>
}

/**
 * Builds the progress of each requisition from its sourcing rounds, purchase orders, goods
 * receipts, material issue, returns and custody close-out, using a fixed number of queries
 * per call regardless of how many requisitions are on the page.
 */
export async function loadRequisitionProgressAsync(
  db: DbExecutor,
  sources: readonly ProgressSource[],
  visibility: ProgressVisibility,
): Promise<Map<number, RequisitionProgressDto>> {
  if (sources.length === 0) return new Map()

  const ids = sources.map(source => source.requisition.id)
  const rounds = groupBy(await loadRoundsAsync(db, ids), round => round.requisitionId)
  const orders = groupBy(await loadOrdersAsync(db, ids), order => order.order.requisitionId)
  const issues = await loadIssuesAsync(db, ids)

  // Only an untouched site-use request needs the store balance: it decides whether the
  // request will be issued from stock or has to be bought first.
  const needingBalance = sources
    .map(source => source.requisition)
    .filter(requisition => requisition.requestType === RequisitionTypes.SiteUse
      && requisition.status !== RequisitionWorkflowStates.Rejected
      && !issues.has(requisition.id)
      && !rounds.has(requisition.id)
      && !orders.has(requisition.id))
  const balances = await loadBalancesAsync(db, needingBalance)

  const userNames = visibility.names
    ? await loadUserNamesAsync(db, [
      ...[...orders.values()].flat().flatMap(item => [
        item.order.issuedByUserId,
        ...item.receipts.map(receipt => receipt.receivedByUserId),
      ]),
      ...[...issues.values()].flatMap(item => [
        item.issue.issuedByUserId,
        item.issue.confirmedByUserId,
        item.resolution?.resolvedByUserId ?? null,
        item.closeout?.decidedByUserId ?? null,
      ]),
    ])
    : new Map<number, string>()

  const related: Related = { rounds, orders, issues, balances, userNames }
  return new Map(sources.map(source => [source.requisition.id, buildProgress(source, related, visibility)]))
}

function buildProgress(source: ProgressSource, related: Related, visibility: ProgressVisibility): RequisitionProgressDto {
  const { requisition } = source
  const unit = source.materialUnit ?? ''
  const amount = (value: Decimal.Value) => `${quantity(value)} ${unit}`.trim()
  const name = (userId: number | null | undefined) =>
    visibility.names && userId != null ? related.userNames.get(userId) ?? null : null
  const siteUse = requisition.requestType === RequisitionTypes.SiteUse
  const rounds = related.rounds.get(requisition.id) ?? []
  const orders = related.orders.get(requisition.id) ?? []
  const record = related.issues.get(requisition.id) ?? null
  const issue = record?.issue ?? null
  const decision = source.approvalEvents.findLast(event => event.eventType.startsWith('Supervisor')) ?? null
  const revisions = source.approvalEvents.filter(event => event.eventType === 'Revised').length

  const liveOrder = orders.findLast(item => PurchaseOrderWorkflowStates.Live.has(item.order.status)) ?? null
  const endedOrder = orders.findLast(item => !PurchaseOrderWorkflowStates.Live.has(item.order.status)) ?? null
  const currentRound = rounds.findLast(round => round.status === SourcingRoundWorkflowStates.Open
    || round.status === SourcingRoundWorkflowStates.Awarded) ?? null
  const latestRound = rounds.at(-1) ?? null
  const stockCovers = dec(related.balances.get(balanceKey(requisition.projectId, requisition.materialId)) ?? 0)
    .gte(requisition.quantity)
  // Store replenishment is always bought; a site-use request is bought when buying has
  // started, or when nothing has happened yet and the store cannot cover it.
  const buys = !siteUse || liveOrder !== null || currentRound !== null
    || (issue === null && (orders.length > 0 || rounds.length > 0 || !stockCovers))
  const lastReceipt = liveOrder?.receipts.at(-1) ?? null

  const journey = new Journey()

  journey.add({ key: 'requested', label: siteUse ? 'Request raised' : 'Restock requested', role: siteUse ? 'Foreman' : 'Storekeeper' }, () => ({
    kind: 'done',
    at: requisition.createdAt,
    actorName: visibility.names ? source.requestedByUserName : null,
    detail: revisions > 0 ? `Revised ${revisions} time${revisions === 1 ? '' : 's'}` : null,
  }))

  journey.add({ key: 'approval', label: 'Supervisor approval', role: 'Supervisor' }, () => {
    const reason = visibility.notes ? decision?.comments ?? null : null
    switch (requisition.status) {
      case RequisitionWorkflowStates.Approved:
        return {
          kind: 'done',
          at: requisition.approvedAt ?? decision?.occurredAt ?? null,
          actorName: visibility.names ? source.approvedByUserName : null,
        }
      case RequisitionWorkflowStates.Rejected:
        return {
          kind: 'stopped',
          headline: 'Rejected by the Supervisor',
          at: requisition.approvedAt ?? decision?.occurredAt ?? requisition.updatedAt,
          actorName: visibility.names ? source.approvedByUserName : null,
          detail: reason,
        }
      case RequisitionWorkflowStates.ReturnedForRevision:
        return {
          kind: 'current',
          headline: 'Returned to the Foreman for changes',
          waitingOn: 'Foreman',
          since: decision?.occurredAt ?? requisition.updatedAt,
          detail: reason,
        }
      default:
        return {
          kind: 'current',
          headline: 'Waiting for the Supervisor to approve',
          waitingOn: 'Supervisor',
          since: source.approvalEvents.at(-1)?.occurredAt ?? requisition.updatedAt,
        }
    }
  })

  if (buys) {
    journey.add({ key: 'quotes', label: 'Supplier quotes', role: 'Procurement Officer' }, () => {
      const quotes = (round: Round) => `${round.quoteCount} quote${round.quoteCount === 1 ? '' : 's'}`
      if (liveOrder !== null) {
        const round = currentRound ?? latestRound
        return { kind: 'done', at: liveOrder.order.createdAt, detail: round === null ? null : `${quotes(round)} received` }
      }
      if (currentRound?.status === SourcingRoundWorkflowStates.Open) {
        return {
          kind: 'current',
          headline: 'Procurement is collecting supplier quotes',
          waitingOn: 'Procurement Officer',
          since: currentRound.createdAt,
          detail: `${quotes(currentRound)} so far`,
          expectedBy: currentRound.quoteDueAt?.toISOString() ?? null,
        }
      }

      const orderEndedAt = endedOrder?.order.cancelledAt ?? endedOrder?.order.rejectedAt ?? null
      const roundEndedAt = latestRound?.status === SourcingRoundWorkflowStates.Closed
        || latestRound?.status === SourcingRoundWorkflowStates.Cancelled
        ? latestRound.closedAt
        : null
      if (orderEndedAt !== null && (roundEndedAt === null || orderEndedAt >= roundEndedAt)) {
        const ending = endedOrder!.order.status === PurchaseOrderWorkflowStates.Rejected ? 'rejected' : 'cancelled'
        return {
          kind: 'current',
          headline: 'Waiting for Procurement to source it again',
          waitingOn: 'Procurement Officer',
          since: orderEndedAt,
          detail: `Purchase order ${endedOrder!.order.purchaseOrderNumber} was ${ending}.`,
        }
      }
      if (roundEndedAt !== null) {
        return {
          kind: 'current',
          headline: 'Waiting for Procurement to source it again',
          waitingOn: 'Procurement Officer',
          since: roundEndedAt,
          detail: `The last sourcing round was ${latestRound!.status.toLowerCase()} without an order.`,
        }
      }
      return {
        kind: 'current',
        headline: siteUse ? 'The store is short, waiting for Procurement to start buying' : 'Waiting for Procurement to start buying',
        waitingOn: 'Procurement Officer',
        since: requisition.approvedAt ?? requisition.updatedAt,
      }
    })

    journey.add({ key: 'order', label: 'Purchase order', role: 'Procurement Officer' }, () => {
      if (liveOrder === null) return null
      const { order } = liveOrder
      const reference = order.purchaseOrderNumber
      switch (order.status) {
        case PurchaseOrderWorkflowStates.Issued:
          return { kind: 'done', at: order.issuedAt, reference, actorName: name(order.issuedByUserId), detail: 'Sent to the supplier' }
        case PurchaseOrderWorkflowStates.Submitted:
          return {
            kind: 'current',
            headline: 'Purchase order waiting for Supervisor approval',
            waitingOn: 'Supervisor',
            since: order.submittedAt ?? order.createdAt,
            reference,
          }
        case PurchaseOrderWorkflowStates.Approved:
          return {
            kind: 'current',
            headline: 'Order approved, waiting for Procurement to send it to the supplier',
            waitingOn: 'Procurement Officer',
            since: order.approvedAt ?? order.createdAt,
            reference,
          }
        default:
          return {
            kind: 'current',
            headline: 'Procurement is preparing the purchase order',
            waitingOn: 'Procurement Officer',
            since: order.createdAt,
            reference,
          }
      }
    })

    journey.add({ key: 'delivery', label: 'Delivered to store', role: 'Storekeeper' }, () => {
      if (liveOrder?.order.status !== PurchaseOrderWorkflowStates.Issued) return null
      const { order, lineQuantity, requiresTechnicalAcceptance, receipts } = liveOrder
      // Same rule as receiving: a delivery the Engineer rejected no longer counts towards the order.
      const counted = receipts.filter(receipt => dec(receipt.acceptedQuantity).gt(0)
        && receipt.latestReviewOutcome !== TechnicalAcceptanceOutcomes.Rejected)
      const received = sum(counted.map(receipt => receipt.acceptedQuantity))
      const held = counted.filter(receipt => requiresTechnicalAcceptance
        && !receipt.postedToStock
        && receipt.latestReviewOutcome !== TechnicalAcceptanceOutcomes.Accepted)
      const progressText = `${quantity(received)} of ${amount(lineQuantity)} received`
      const expectedBy = order.expectedDeliveryDate

      if (held.length === 0 && (received.gte(lineQuantity) || issue !== null)) {
        const deliveries = counted.length > 1 ? ` in ${counted.length} deliveries` : ''
        return {
          kind: 'done',
          at: lastReceipt?.receivedAt ?? null,
          reference: counted.at(-1)?.receiptNumber ?? null,
          actorName: name(lastReceipt?.receivedByUserId),
          detail: `${amount(received)} received${deliveries}`,
        }
      }
      if (held.length > 0) {
        return {
          kind: 'current',
          headline: 'Delivered, waiting for the Engineer to check it',
          waitingOn: 'Engineer',
          since: held[0]!.receivedAt,
          reference: held[0]!.receiptNumber,
          detail: progressText,
        }
      }
      if (received.gt(0)) {
        return {
          kind: 'current',
          headline: 'Partly delivered, waiting for the supplier to bring the rest',
          waitingOn: 'Supplier',
          since: lastReceipt!.receivedAt,
          reference: order.purchaseOrderNumber,
          detail: progressText,
          expectedBy,
        }
      }
      const failedCheck = receipts.findLast(receipt => receipt.latestReviewOutcome === TechnicalAcceptanceOutcomes.Rejected)
      return {
        kind: 'current',
        headline: failedCheck
          ? 'Delivery failed the engineering check, waiting for a replacement'
          : 'Ordered, waiting for the supplier to deliver',
        waitingOn: 'Supplier',
        since: failedCheck?.receivedAt ?? order.issuedAt ?? order.createdAt,
        reference: order.purchaseOrderNumber,
        expectedBy,
      }
    })
  }

  if (!siteUse) return journey.finish('Delivered into the store')

  journey.add({ key: 'issue', label: 'Issued from store', role: 'Storekeeper' }, () => {
    if (issue !== null) {
      return {
        kind: 'done',
        at: issue.issuedAt,
        reference: issue.issueNumber,
        actorName: name(issue.issuedByUserId),
        detail: `${amount(issue.quantityIssued)} issued`,
      }
    }
    return {
      kind: 'current',
      headline: buys ? 'Delivered, waiting for the Storekeeper to issue it' : 'In stock, waiting for the Storekeeper to issue it',
      waitingOn: 'Storekeeper',
      since: (buys ? lastReceipt?.receivedAt : null) ?? requisition.approvedAt ?? requisition.updatedAt,
    }
  })

  journey.add({ key: 'handover', label: 'Received on site', role: 'Foreman' }, () => {
    if (record === null || issue === null) return null
    if (issue.status === MaterialIssueStatuses.AwaitingConfirmation) {
      return {
        kind: 'current',
        headline: 'Issued, waiting for the Foreman to confirm receipt',
        waitingOn: 'Foreman',
        since: issue.issuedAt,
        reference: issue.issueNumber,
      }
    }
    if (issue.status === MaterialIssueStatuses.Disputed) {
      return {
        kind: 'current',
        headline: 'Quantity difference reported, waiting for the Supervisor',
        waitingOn: 'Supervisor',
        since: issue.confirmedAt ?? issue.issuedAt,
        reference: issue.issueNumber,
        detail: `The Foreman received ${quantity(issue.confirmedQuantity ?? 0)} of ${amount(issue.quantityIssued)}`,
      }
    }
    const { resolution } = record
    return {
      kind: 'done',
      at: resolution?.resolvedAt ?? issue.confirmedAt,
      actorName: name(issue.confirmedByUserId),
      detail: resolution
        ? `${amount(resolution.foremanReceivedQuantity)} received; ${quantity(resolution.returnedToStoreQuantity)} went back to the store`
        : `${amount(issue.confirmedQuantity ?? 0)} received`,
    }
  })

  journey.add({ key: 'closeout', label: 'Material accounted for', role: 'Foreman' }, () => {
    if (record === null || issue === null) return null
    const { closeout } = record
    const confirmed = dec(issue.confirmedQuantity)
    const tally = `Used ${quantity(record.used)}, wasted ${quantity(record.wasted)}, returned ${quantity(record.returned)} of ${amount(confirmed)}`
    if (closeout?.status === CustodyCloseoutStatuses.Approved) {
      return {
        kind: 'done',
        at: closeout.decidedAt ?? closeout.submittedAt,
        role: 'Supervisor',
        reference: closeout.closeoutNumber,
        actorName: name(closeout.decidedByUserId),
        detail: tally,
      }
    }
    if (closeout?.status === CustodyCloseoutStatuses.AwaitingReview) {
      return {
        kind: 'current',
        headline: 'Close-out waiting for the Supervisor to review',
        waitingOn: 'Supervisor',
        since: closeout.submittedAt,
        reference: closeout.closeoutNumber,
        detail: tally,
      }
    }
    if (record.pendingReturn !== null) {
      return {
        kind: 'current',
        headline: `Return of ${amount(record.pendingReturn.quantity)} waiting for the Storekeeper`,
        waitingOn: 'Storekeeper',
        since: record.pendingReturn.since,
        detail: tally,
      }
    }
    if (closeout?.status === CustodyCloseoutStatuses.Returned) {
      return {
        kind: 'current',
        headline: 'Close-out returned to the Foreman for correction',
        waitingOn: 'Foreman',
        since: closeout.decidedAt ?? closeout.submittedAt,
        reference: closeout.closeoutNumber,
        detail: visibility.notes ? closeout.decisionNotes : tally,
      }
    }
    const remaining = confirmed.minus(record.used).minus(record.wasted).minus(record.returned)
    return {
      kind: 'current',
      headline: remaining.lte(0)
        ? 'Everything is recorded, waiting for the Foreman to submit the close-out'
        : 'On site with the Foreman, use and returns are being recorded',
      waitingOn: 'Foreman',
      since: record.resolution?.resolvedAt ?? issue.confirmedAt ?? issue.issuedAt,
      detail: tally,
    }
  })

  return journey.finish('All material accounted for')
}

type StepInput = Pick<RequisitionProgressStepDto, 'key' | 'label' | 'role'>
/** `role` replaces the step's usual role when someone else completed it, e.g. a Supervisor approving a close-out. */
type StepExtras = Partial<Pick<RequisitionProgressStepDto, 'role' | 'detail' | 'reference' | 'actorName' | 'expectedBy'>>
type StepOutcome =
  | ({ kind: 'done'; at: Date | null } & StepExtras)
  | ({ kind: 'current'; headline: string; waitingOn: string; since: Date } & StepExtras)
  | ({ kind: 'stopped'; headline: string; at: Date } & StepExtras)

/** Steps in order; the first step that is not done becomes the current position. */
class Journey {
  private readonly steps: RequisitionProgressStepDto[] = []
  private position: Omit<RequisitionProgressDto, 'steps'> | null = null
  private lastDoneAt: Date | null = null

  /** `resolve` runs only while every earlier step is done; null means the step is not reached yet. */
  add(step: StepInput, resolve: () => StepOutcome | null): void {
    if (this.position?.state === 'Stopped') return
    const outcome = this.position === null ? resolve() : null
    const base = { ...step, detail: null, reference: null, actorName: null, at: null, expectedBy: null }
    if (outcome === null) {
      this.steps.push({ ...base, status: 'Upcoming' })
      return
    }

    const extras = {
      role: outcome.role ?? step.role,
      detail: outcome.detail ?? null,
      reference: outcome.reference ?? null,
      actorName: outcome.actorName ?? null,
      expectedBy: outcome.expectedBy ?? null,
    }
    if (outcome.kind === 'done') {
      this.steps.push({ ...base, ...extras, status: 'Done', at: outcome.at })
      if (outcome.at !== null) this.lastDoneAt = outcome.at
    } else if (outcome.kind === 'current') {
      this.steps.push({ ...base, ...extras, status: 'Current', role: outcome.waitingOn === 'Supplier' ? extras.role : outcome.waitingOn })
      this.position = { state: 'InProgress', headline: outcome.headline, waitingOn: outcome.waitingOn, since: outcome.since }
    } else {
      this.steps.push({ ...base, ...extras, status: 'Stopped', at: outcome.at })
      this.position = { state: 'Stopped', headline: outcome.headline, waitingOn: null, since: outcome.at }
    }
  }

  finish(completedHeadline: string): RequisitionProgressDto {
    const position = this.position ?? {
      state: 'Completed' as const,
      headline: completedHeadline,
      waitingOn: null,
      since: this.lastDoneAt ?? new Date(0),
    }
    return { ...position, steps: this.steps }
  }
}

async function loadRoundsAsync(db: DbExecutor, requisitionIds: number[]) {
  return await db
    .select({
      requisitionId: sourcingRounds.requisitionId,
      status: sourcingRounds.status,
      quoteDueAt: sourcingRounds.quoteDueAt,
      createdAt: sourcingRounds.createdAt,
      closedAt: sourcingRounds.closedAt,
      // Spelled out in full: drizzle leaves column names unqualified in a single-table select,
      // which would make the subquery compare the quote table with itself.
      quoteCount: sql<number>`(
        SELECT count(*)::integer FROM "SupplierQuotes" AS quote
        WHERE quote."SourcingRoundId" = "SourcingRounds"."Id")`,
    })
    .from(sourcingRounds)
    .where(inArray(sourcingRounds.requisitionId, requisitionIds))
    .orderBy(asc(sourcingRounds.createdAt), asc(sourcingRounds.id))
}

async function loadOrdersAsync(db: DbExecutor, requisitionIds: number[]) {
  // A purchase order has exactly one line (PurchaseOrderInvariant), so the join keeps one row per order.
  const orders = await db
    .select({
      order: {
        id: purchaseOrders.id,
        requisitionId: purchaseOrders.requisitionId,
        purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
        status: purchaseOrders.status,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        issuedByUserId: purchaseOrders.issuedByUserId,
        createdAt: purchaseOrders.createdAt,
        submittedAt: purchaseOrders.submittedAt,
        approvedAt: purchaseOrders.approvedAt,
        issuedAt: purchaseOrders.issuedAt,
        rejectedAt: purchaseOrders.rejectedAt,
        cancelledAt: purchaseOrders.cancelledAt,
      },
      lineQuantity: purchaseOrderLines.quantity,
      requiresTechnicalAcceptance: purchaseOrderLines.requiresTechnicalAcceptance,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .where(inArray(purchaseOrders.requisitionId, requisitionIds))
    .orderBy(asc(purchaseOrders.createdAt), asc(purchaseOrders.id))
  if (orders.length === 0) return []

  const receipts = await db
    .select({
      purchaseOrderId: goodsReceipts.purchaseOrderId,
      receiptNumber: goodsReceipts.receiptNumber,
      acceptedQuantity: goodsReceipts.acceptedQuantity,
      receivedByUserId: goodsReceipts.receivedByUserId,
      receivedAt: goodsReceipts.receivedAt,
      // Qualified by hand for the same reason as quoteCount above.
      latestReviewOutcome: sql<string | null>`(
        SELECT review."Outcome" FROM "GoodsReceiptTechnicalAcceptances" AS review
        WHERE review."GoodsReceiptId" = "GoodsReceipts"."Id"
        ORDER BY review."ReviewSequence" DESC
        LIMIT 1)`,
      postedToStock: sql<boolean>`EXISTS (
        SELECT 1 FROM "StockLedgerEntries" AS entry
        WHERE entry."ReferenceType" = 'GoodsReceipt'
          AND entry."ReferenceId" = "GoodsReceipts"."Id"
          AND entry."MovementType" = 'Receipt'
          AND entry."QuantityDelta" > 0)`,
    })
    .from(goodsReceipts)
    .where(inArray(goodsReceipts.purchaseOrderId, orders.map(item => item.order.id)))
    .orderBy(asc(goodsReceipts.receivedAt), asc(goodsReceipts.id))
  return orders.map(item => ({
    ...item,
    receipts: receipts.filter(receipt => receipt.purchaseOrderId === item.order.id),
  }))
}

async function loadIssuesAsync(db: DbExecutor, requisitionIds: number[]): Promise<Map<number, IssueRecord>> {
  const issues = await db
    .select()
    .from(materialIssues)
    .where(inArray(materialIssues.requisitionId, requisitionIds))
  if (issues.length === 0) return new Map()

  const issueIds = issues.map(issue => issue.id)
  const usage = await db
    .select({
      materialIssueId: materialUsageRecords.materialIssueId,
      usageType: materialUsageRecords.usageType,
      quantity: sql<string>`SUM(${materialUsageRecords.quantity})`,
    })
    .from(materialUsageRecords)
    .where(inArray(materialUsageRecords.materialIssueId, issueIds))
    .groupBy(materialUsageRecords.materialIssueId, materialUsageRecords.usageType)
  const returns = await db
    .select({
      materialIssueId: materialReturns.materialIssueId,
      status: materialReturns.status,
      quantityOffered: materialReturns.quantityOffered,
      quantityAccepted: materialReturns.quantityAccepted,
      returnedAt: materialReturns.returnedAt,
    })
    .from(materialReturns)
    .where(inArray(materialReturns.materialIssueId, issueIds))
  const resolutions = await db
    .select({
      materialIssueId: materialIssueDisputeResolutions.materialIssueId,
      foremanReceivedQuantity: materialIssueDisputeResolutions.foremanReceivedQuantity,
      returnedToStoreQuantity: materialIssueDisputeResolutions.returnedToStoreQuantity,
      resolvedByUserId: materialIssueDisputeResolutions.resolvedByUserId,
      resolvedAt: materialIssueDisputeResolutions.resolvedAt,
    })
    .from(materialIssueDisputeResolutions)
    .where(inArray(materialIssueDisputeResolutions.materialIssueId, issueIds))
  const closeouts = await db
    .select({
      materialIssueId: materialCustodyCloseouts.materialIssueId,
      closeoutNumber: materialCustodyCloseouts.closeoutNumber,
      revision: materialCustodyCloseouts.revision,
      status: materialCustodyCloseouts.status,
      submittedAt: materialCustodyCloseouts.submittedAt,
      decidedByUserId: materialCustodyCloseoutDecisions.decidedByUserId,
      decisionNotes: materialCustodyCloseoutDecisions.notes,
      decidedAt: materialCustodyCloseoutDecisions.decidedAt,
    })
    .from(materialCustodyCloseouts)
    .leftJoin(
      materialCustodyCloseoutDecisions,
      eq(materialCustodyCloseoutDecisions.materialCustodyCloseoutId, materialCustodyCloseouts.id))
    .where(inArray(materialCustodyCloseouts.materialIssueId, issueIds))
    .orderBy(asc(materialCustodyCloseouts.revision), asc(materialCustodyCloseouts.id))

  return new Map(issues.map((issue): [number, IssueRecord] => {
    const usageTotal = (type: string) => sum(usage
      .filter(item => item.materialIssueId === issue.id && item.usageType === type)
      .map(item => item.quantity))
    const issueReturns = returns.filter(item => item.materialIssueId === issue.id)
    const pending = issueReturns.filter(item => item.status === MaterialReturnStatuses.AwaitingReceipt)
    return [issue.requisitionId, {
      issue,
      used: usageTotal('Used'),
      wasted: usageTotal('Wastage'),
      returned: sum(issueReturns
        .filter(item => item.status === MaterialReturnStatuses.Received)
        .map(item => item.quantityAccepted)),
      pendingReturn: pending.length === 0
        ? null
        : {
            quantity: sum(pending.map(item => item.quantityOffered)),
            since: new Date(Math.min(...pending.map(item => item.returnedAt.getTime()))),
          },
      resolution: resolutions.find(item => item.materialIssueId === issue.id) ?? null,
      closeout: closeouts.findLast(item => item.materialIssueId === issue.id) ?? null,
    }]
  }))
}

async function loadBalancesAsync(
  db: DbExecutor,
  pending: readonly { projectId: number; materialId: number }[],
): Promise<Map<string, number>> {
  if (pending.length === 0) return new Map()
  const rows = await db
    .select({
      projectId: stockBalances.projectId,
      materialId: stockBalances.materialId,
      quantityOnHand: stockBalances.quantityOnHand,
    })
    .from(stockBalances)
    .where(and(
      inArray(stockBalances.projectId, [...new Set(pending.map(item => item.projectId))]),
      inArray(stockBalances.materialId, [...new Set(pending.map(item => item.materialId))])))
  return new Map(rows.map(row => [balanceKey(row.projectId, row.materialId), row.quantityOnHand]))
}

async function loadUserNamesAsync(db: DbExecutor, userIds: (number | null)[]): Promise<Map<number, string>> {
  const ids = [...new Set(userIds.filter((id): id is number => id !== null))]
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, ids))
  return new Map(rows.map(row => [row.id, row.fullName]))
}

function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const id = key(item)
    const group = groups.get(id)
    if (group) group.push(item)
    else groups.set(id, [item])
  }
  return groups
}

function balanceKey(projectId: number, materialId: number): string {
  return `${projectId}:${materialId}`
}

function quantity(amount: Decimal.Value): string {
  return dec(amount).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed()
}
