import { and, desc, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm'
import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, formatNumber, sum, Decimal } from '@/ConstructionMS.Application/Common/Money'
import { PettyCashStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import type { DbExecutor } from '../../Data/AppDbContext'
import {
  pettyCashRequests,
  projectBudgetAllocations,
  projectBudgets,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
} from '../../Data/schema'

const CommittedPurchaseOrderStates = [PurchaseOrderWorkflowStates.Approved, PurchaseOrderWorkflowStates.Issued]
const lineAmount = sql<string | null>`COALESCE(SUM(${purchaseOrderLines.quantity} * ${purchaseOrderLines.unitPrice}), 0)`
const pettyCashAmount = sql<string | null>`COALESCE(SUM(${pettyCashRequests.amountCommitted}), 0)`

async function sumPurchaseOrders(db: DbExecutor, conditions: (SQL | undefined)[]): Promise<Decimal> {
  const [row] = await db
    .select({ amount: lineAmount })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
    .innerJoin(requisitions, eq(purchaseOrderLines.requisitionId, requisitions.id))
    .where(and(inArray(purchaseOrders.status, CommittedPurchaseOrderStates), ...conditions))
  return dec(row?.amount)
}

async function sumPettyCash(db: DbExecutor, conditions: (SQL | undefined)[]): Promise<Decimal> {
  const [row] = await db
    .select({ amount: pettyCashAmount })
    .from(pettyCashRequests)
    .where(and(
      isNotNull(pettyCashRequests.amountCommitted),
      ne(pettyCashRequests.status, PettyCashStatuses.Rejected),
      ...conditions))
  return dec(row?.amount)
}

export const BudgetCommitmentGuard = Object.freeze({
  async lockProjectAsync(db: DbExecutor, projectId: number): Promise<void> {
    await db.execute(sql`SELECT 1 FROM "Projects" WHERE "Id" = ${projectId} FOR UPDATE`)
  },

  async ensureAvailableAsync(
    db: DbExecutor,
    projectId: number,
    costCodeId: number,
    proposedAmount: Decimal.Value,
    excludedPurchaseOrderId: number | null = null,
    excludedPettyCashRequestId: number | null = null,
  ): Promise<void> {
    const [budget] = await db
      .select({ id: projectBudgets.id, approvedAmount: projectBudgets.approvedAmount })
      .from(projectBudgets)
      .where(eq(projectBudgets.projectId, projectId))
      .orderBy(desc(projectBudgets.createdAt), desc(projectBudgets.id))
      .limit(1)
    if (!budget) {
      throw new InvalidOperationError('Set a project budget before approving this commitment.')
    }

    const allocations = await db
      .select({ allocatedAmount: projectBudgetAllocations.allocatedAmount })
      .from(projectBudgetAllocations)
      .where(and(
        eq(projectBudgetAllocations.projectBudgetId, budget.id),
        eq(projectBudgetAllocations.costCodeId, costCodeId)))
      .limit(2)
    if (allocations.length > 1) {
      throw new InvalidOperationError('Sequence contains more than one element')
    }

    const costCodeAllocation = allocations[0]?.allocatedAmount
    if (costCodeAllocation === undefined) {
      throw new InvalidOperationError('This budget area has no allocation in the current budget.')
    }

    const excludedPurchaseOrder = excludedPurchaseOrderId !== null
      ? ne(purchaseOrderLines.purchaseOrderId, excludedPurchaseOrderId)
      : undefined
    const excludedPettyCash = excludedPettyCashRequestId !== null
      ? ne(pettyCashRequests.id, excludedPettyCashRequestId)
      : undefined

    const costCodeCommitted = (await sumPurchaseOrders(db, [
      eq(purchaseOrders.projectId, projectId),
      eq(requisitions.costCodeId, costCodeId),
      excludedPurchaseOrder,
    ])).plus(await sumPettyCash(db, [
      eq(pettyCashRequests.projectId, projectId),
      eq(pettyCashRequests.costCodeId, costCodeId),
      excludedPettyCash,
    ]))

    const projectCommitted = (await sumPurchaseOrders(db, [
      eq(purchaseOrders.projectId, projectId),
      excludedPurchaseOrder,
    ])).plus(await sumPettyCash(db, [
      eq(pettyCashRequests.projectId, projectId),
      excludedPettyCash,
    ]))

    const proposed = dec(proposedAmount)
    const projectAvailable = dec(budget.approvedAmount).minus(projectCommitted)
    if (proposed.gt(projectAvailable)) {
      throw new InvalidOperationError(
        `Project budget available: KES ${formatNumber(Decimal.max(projectAvailable, 0))}.`)
    }

    const costCodeAvailable = dec(costCodeAllocation).minus(costCodeCommitted)
    if (proposed.gt(costCodeAvailable)) {
      throw new InvalidOperationError(
        `Budget-area amount available: KES ${formatNumber(Decimal.max(costCodeAvailable, 0))}.`)
    }
  },

  async ensureRevisionCoversCommitmentsAsync(
    db: DbExecutor,
    projectId: number,
    approvedAmount: Decimal.Value,
    allocations: ReadonlyMap<number, Decimal.Value>,
  ): Promise<void> {
    const purchaseCommitments = await db
      .select({ costCodeId: requisitions.costCodeId, amount: lineAmount })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
      .innerJoin(requisitions, eq(purchaseOrderLines.requisitionId, requisitions.id))
      .where(and(
        eq(purchaseOrders.projectId, projectId),
        inArray(purchaseOrders.status, CommittedPurchaseOrderStates)))
      .groupBy(requisitions.costCodeId)
    const pettyCashCommitments = await db
      .select({ costCodeId: pettyCashRequests.costCodeId, amount: pettyCashAmount })
      .from(pettyCashRequests)
      .where(and(
        eq(pettyCashRequests.projectId, projectId),
        isNotNull(pettyCashRequests.amountCommitted),
        ne(pettyCashRequests.status, PettyCashStatuses.Rejected)))
      .groupBy(pettyCashRequests.costCodeId)

    const committedByCostCode = new Map<number, Decimal>()
    for (const item of [...purchaseCommitments, ...pettyCashCommitments]) {
      committedByCostCode.set(
        item.costCodeId,
        (committedByCostCode.get(item.costCodeId) ?? dec(0)).plus(dec(item.amount)))
    }

    const totalCommitted = sum(committedByCostCode.values())
    if (totalCommitted.gt(dec(approvedAmount))) {
      throw new InvalidOperationError(
        `Current commitments are KES ${formatNumber(totalCommitted)}. The project budget cannot be lower.`)
    }

    for (const [costCodeId, committed] of committedByCostCode) {
      const allocated = dec(allocations.get(costCodeId) ?? 0)
      if (committed.gt(allocated)) {
        throw new InvalidOperationError(
          `A budget area already has KES ${formatNumber(committed)} committed. Its allocation cannot be lower.`)
      }
    }
  },
})
