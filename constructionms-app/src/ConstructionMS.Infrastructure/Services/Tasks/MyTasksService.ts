import { and, asc, eq, exists, gt, gte, inArray, lt, ne, not, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ArgumentError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import { Decimal, dec, formatNumber, sum } from '@/ConstructionMS.Application/Common/Money'
import type { TaskInboxOptions } from '@/ConstructionMS.Application/Configuration/TaskInboxOptions'
import type { MyTaskResponseDto, MyTasksResponseDto } from '@/ConstructionMS.Application/DTOs/Tasks/TaskDtos'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IMyTasksService } from '@/ConstructionMS.Application/Services/Tasks/IMyTasksService'
import {
  ControlledCorrectionStatuses,
  CustodyCloseoutStatuses,
  MaterialReturnStatuses,
  OpeningPositionStatuses,
  OpeningPositionTypes,
  OperationalPeriodScopes,
  OperationalPeriodStatuses,
} from '@/ConstructionMS.Domain/Entities/ControlWorkspaceEntities'
import { InvoiceStatuses, PettyCashReconciliationStatuses, PettyCashStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import {
  MaterialIssueStatuses,
  StockCountStatuses,
  StockTransferStatuses,
  TechnicalAcceptanceOutcomes,
} from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import { MaterialCatalogRequestStatuses } from '@/ConstructionMS.Domain/Entities/MaterialCatalogRequest'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { RequisitionTypes } from '@/ConstructionMS.Domain/Entities/Requisition'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { PurchaseOrderInvariant } from '../../Common/PurchaseOrderInvariant'
import { compareOrdinalStrings } from '../../Common/StringComparison'
import type { AppDbContext } from '../../Data/AppDbContext'
import {
  accessRequests,
  controlledCorrections,
  goodsReceiptTechnicalAcceptances,
  goodsReceipts,
  materialCatalogRequests,
  materialCustodyCloseoutDecisions,
  materialCustodyCloseouts,
  materialIssues,
  materialReturns,
  materialUsageRecords,
  materials,
  openingInventoryLines,
  openingPositionBatches,
  operationalPeriodEvents,
  operationalPeriods,
  paymentAuthorizations,
  payments,
  pettyCashDisbursements,
  pettyCashReceiptConfirmations,
  pettyCashReconciliations,
  pettyCashRequests,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
  stockBalances,
  stockCounts,
  stockLedgerEntries,
  stockTransfers,
  supplierInvoices,
  suppliers,
  userProjectAssignments,
  users,
} from '../../Data/schema'

const BusinessUtcOffsetMs = 3 * 60 * 60 * 1000
const HourMs = 60 * 60 * 1000

const fromProject = alias(projects, 'from_project')
const toProject = alias(projects, 'to_project')

interface TaskInput {
  key: string
  type: string
  title: string
  detail: string
  requiredRole: string
  projectId: number | null
  projectName: string | null
  sourceType: string
  sourceId: number
  targetPath: string
  openedAt: Date
  urgent?: boolean
  handover?: boolean
  dueAt?: Date | null
}

/**
 * Builds the inbox directly from authoritative workflow records. Nothing in this
 * service grants action rights; command services continue to enforce RBAC and
 * segregation of duties when a user follows a task link.
 */
export class MyTasksService implements IMyTasksService {
  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
    private readonly options: TaskInboxOptions,
  ) {}

  async getMyTasksAsync(
    userId: number,
    requestedRole: string | null = null,
    projectId: number | null = null,
    overdueOnly = false,
  ): Promise<MyTasksResponseDto> {
    if (userId <= 0) throw new UnauthorizedAccessError('The authenticated user identity is invalid.')
    if (projectId !== null && projectId <= 0) throw new ArgumentError('Project ID must be positive.', 'projectId')

    const actor = await this.roles.resolveAsync(userId, requestedRole)
    if (actor === null) throw new UnauthorizedAccessError('The active account could not be verified.')

    const allProjects = actor.canSwitchRoles || actor.effectiveRole === 'CEO' || actor.effectiveRole === 'Auditor'
    let projectIds = allProjects
      ? (await this.db.select({ id: projects.id }).from(projects)).map(project => project.id)
      : (await this.db
        .select({ projectId: userProjectAssignments.projectId })
        .from(userProjectAssignments)
        .where(and(eq(userProjectAssignments.userId, actor.userId), eq(userProjectAssignments.isActive, true))))
        .map(assignment => assignment.projectId)

    if (projectId !== null) {
      if (!allProjects && !projectIds.includes(projectId)) {
        throw new UnauthorizedAccessError('You are not assigned to that project.')
      }
      projectIds = projectIds.filter(id => id === projectId)
    }

    const now = new Date()
    const tasks: MyTaskResponseDto[] = []
    switch (actor.effectiveRole) {
      case 'Administrator':
        await this.addAdministratorTasksAsync(tasks)
        break
      case 'CEO':
        await this.addCeoTasksAsync(tasks, projectIds)
        break
      case 'Supervisor':
        await this.addSupervisorTasksAsync(tasks, actor.userId, projectIds)
        break
      case 'Engineer':
        await this.addEngineerTasksAsync(tasks, projectIds)
        break
      case 'Foreman':
        await this.addForemanTasksAsync(tasks, actor.userId, projectIds)
        break
      case 'Storekeeper':
        await this.addStorekeeperTasksAsync(tasks, actor.userId, projectIds)
        break
      case 'Procurement Officer':
        await this.addProcurementTasksAsync(tasks, actor.userId, projectIds)
        break
      case 'Finance Officer':
        await this.addFinanceTasksAsync(tasks, projectIds)
        break
      case 'Auditor':
        break
    }

    for (const task of tasks) task.isOverdue = task.dueAt.getTime() < now.getTime()

    const visible = tasks
      .filter(task => projectId === null || task.projectId === projectId)
      .filter(task => !overdueOnly || task.isOverdue)
      .sort((a, b) =>
        Number(b.isOverdue) - Number(a.isOverdue)
        || a.dueAt.getTime() - b.dueAt.getTime()
        || compareOrdinalStrings(a.taskKey, b.taskKey))

    return {
      generatedAt: now,
      actualRole: actor.actualRole,
      totalCount: visible.length,
      overdueCount: visible.filter(task => task.isOverdue).length,
      items: visible,
    }
  }

  private async addAdministratorTasksAsync(tasks: MyTaskResponseDto[]): Promise<void> {
    const requests = await this.db
      .select({ id: accessRequests.id, username: accessRequests.username, requestedAt: accessRequests.requestedAt })
      .from(accessRequests)
      .where(eq(accessRequests.status, 'Pending'))
      .orderBy(asc(accessRequests.requestedAt))
    for (const request of requests) {
      this.add(tasks, {
        key: `access-review:${request.id}`, type: 'AccessReview', title: 'Review access request',
        detail: request.username, requiredRole: 'Administrator', projectId: null, projectName: null,
        sourceType: 'AccessRequest', sourceId: request.id, targetPath: '/access', openedAt: request.requestedAt, urgent: true,
      })
    }
  }

  private async addCeoTasksAsync(tasks: MyTaskResponseDto[], projectIds: number[]): Promise<void> {
    const invoices = await this.db
      .select({
        id: supplierInvoices.id,
        invoiceNumber: supplierInvoices.invoiceNumber,
        amount: supplierInvoices.amount,
        projectId: supplierInvoices.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
        reviewedAt: supplierInvoices.reviewedAt,
        capturedAt: supplierInvoices.capturedAt,
      })
      .from(supplierInvoices)
      .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(inArray(supplierInvoices.projectId, projectIds), eq(supplierInvoices.status, InvoiceStatuses.AwaitingCeoApproval)))
    for (const invoice of invoices) {
      this.add(tasks, {
        key: `invoice-ceo:${invoice.id}`, type: 'CeoPaymentException', title: 'Review payment exception',
        detail: `${invoice.supplierName} · Invoice ${invoice.invoiceNumber} · KES ${money(invoice.amount)}`,
        requiredRole: 'CEO', projectId: invoice.projectId, projectName: invoice.projectName,
        sourceType: 'SupplierInvoice', sourceId: invoice.id, targetPath: '/finance',
        openedAt: invoice.reviewedAt ?? invoice.capturedAt, urgent: true,
      })
    }

    const openingPositions = await this.db
      .select({
        id: openingPositionBatches.id,
        batchNumber: openingPositionBatches.batchNumber,
        positionType: openingPositionBatches.positionType,
        submittedAt: openingPositionBatches.submittedAt,
        projectId: openingPositionBatches.projectId,
        projectName: projects.name,
      })
      .from(openingPositionBatches)
      .innerJoin(projects, eq(openingPositionBatches.projectId, projects.id))
      .where(and(
        inArray(openingPositionBatches.projectId, projectIds),
        eq(openingPositionBatches.status, OpeningPositionStatuses.AwaitingApproval)))
    for (const item of openingPositions) {
      this.add(tasks, {
        key: `opening-position-decision:${item.id}`, type: 'OpeningPositionDecision', title: 'Review opening position',
        detail: `${item.positionType} · ${item.batchNumber}`, requiredRole: 'CEO',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'OpeningPositionBatch', sourceId: item.id,
        targetPath: '/opening-positions', openedAt: item.submittedAt, urgent: true,
      })
    }

    const periods = await this.loadPeriodsWithLatestEventAsync(and(
      inArray(operationalPeriods.projectId, projectIds),
      eq(operationalPeriods.status, OperationalPeriodStatuses.AwaitingClose)))
    for (const item of periods) {
      const latest = item.latest
      if (latest === null) throw new Error('Sequence contains no elements')
      this.add(tasks, {
        key: `period-close-decision:${item.period.id}:r${latest.sequenceNumber}`,
        type: 'OperationalPeriodCloseDecision', title: 'Review period close',
        detail: `${item.period.scope} · ${item.period.name}`, requiredRole: 'CEO',
        projectId: item.period.projectId, projectName: item.projectName,
        sourceType: 'OperationalPeriod', sourceId: item.period.id, targetPath: '/period-close',
        openedAt: latest.occurredAt, urgent: true,
      })
    }

    const corrections = await this.db
      .select({
        id: controlledCorrections.id,
        correctionNumber: controlledCorrections.correctionNumber,
        correctionType: controlledCorrections.correctionType,
        submittedAt: controlledCorrections.submittedAt,
        projectId: controlledCorrections.projectId,
        projectName: projects.name,
      })
      .from(controlledCorrections)
      .innerJoin(projects, eq(controlledCorrections.projectId, projects.id))
      .where(and(
        inArray(controlledCorrections.projectId, projectIds),
        eq(controlledCorrections.status, ControlledCorrectionStatuses.AwaitingApproval)))
    for (const item of corrections) {
      this.add(tasks, {
        key: `controlled-correction-decision:${item.id}`, type: 'ControlledCorrectionDecision',
        title: 'Review controlled correction', detail: `${item.correctionType} · ${item.correctionNumber}`,
        requiredRole: 'CEO', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'ControlledCorrection', sourceId: item.id, targetPath: '/period-close',
        openedAt: item.submittedAt, urgent: true,
      })
    }
  }

  private async addSupervisorTasksAsync(tasks: MyTaskResponseDto[], userId: number, projectIds: number[]): Promise<void> {
    const requisitionRows = await this.db
      .select({
        id: requisitions.id,
        workflowRevision: requisitions.workflowRevision,
        quantity: requisitions.quantity,
        updatedAt: requisitions.updatedAt,
        projectId: requisitions.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
      })
      .from(requisitions)
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .where(and(
        inArray(requisitions.projectId, projectIds),
        eq(requisitions.status, RequisitionWorkflowStates.AwaitingSupervisorDecision)))
    for (const item of requisitionRows) {
      this.add(tasks, {
        key: `requisition-supervisor:${item.id}:r${item.workflowRevision}`, type: 'RequisitionApproval',
        title: 'Decide material request', detail: `${quantity(item.quantity)} ${item.unit} of ${item.materialName}`,
        requiredRole: 'Supervisor', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'Requisition', sourceId: item.id, targetPath: '/requisitions', openedAt: item.updatedAt,
      })
    }

    const orders = await this.db
      .select({
        id: purchaseOrders.id,
        purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
        projectId: purchaseOrders.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
        submittedAt: purchaseOrders.submittedAt,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(inArray(purchaseOrders.projectId, projectIds), eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Submitted)))
    for (const item of orders) {
      const openedAt = item.submittedAt ?? item.createdAt
      this.add(tasks, {
        key: `po-approval:${item.id}:${ticks(openedAt)}`, type: 'PurchaseOrderApproval', title: 'Review purchase order',
        detail: `${item.supplierName} · ${item.purchaseOrderNumber}`, requiredRole: 'Supervisor',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'PurchaseOrder', sourceId: item.id,
        targetPath: '/purchase-orders', openedAt,
      })
    }

    const invoices = await this.db
      .select({
        id: supplierInvoices.id,
        invoiceNumber: supplierInvoices.invoiceNumber,
        amount: supplierInvoices.amount,
        projectId: supplierInvoices.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
        ceoDecisionAt: supplierInvoices.ceoDecisionAt,
        reviewedAt: supplierInvoices.reviewedAt,
        capturedAt: supplierInvoices.capturedAt,
      })
      .from(supplierInvoices)
      .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(inArray(supplierInvoices.projectId, projectIds), eq(supplierInvoices.status, InvoiceStatuses.ReadyForAuthorization)))
    for (const item of invoices) {
      this.add(tasks, {
        key: `payment-authorization:${item.id}`, type: 'PaymentAuthorization', title: 'Authorize supplier payment',
        detail: `${item.supplierName} · Invoice ${item.invoiceNumber} · KES ${money(item.amount)}`,
        requiredRole: 'Supervisor', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'SupplierInvoice', sourceId: item.id, targetPath: '/finance',
        openedAt: item.ceoDecisionAt ?? item.reviewedAt ?? item.capturedAt, urgent: true,
      })
    }

    const counts = await this.db
      .select({
        id: stockCounts.id,
        countNumber: stockCounts.countNumber,
        variance: stockCounts.variance,
        countedAt: stockCounts.countedAt,
        projectId: stockCounts.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
      })
      .from(stockCounts)
      .innerJoin(projects, eq(stockCounts.projectId, projects.id))
      .innerJoin(materials, eq(stockCounts.materialId, materials.id))
      .where(and(inArray(stockCounts.projectId, projectIds), eq(stockCounts.status, StockCountStatuses.AwaitingReview)))
    for (const item of counts) {
      this.add(tasks, {
        key: `stock-count-review:${item.id}`, type: 'StockCountReview', title: 'Review stock count',
        detail: `${item.materialName} · variance ${quantity(item.variance)} ${item.unit}`, requiredRole: 'Supervisor',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'StockCount', sourceId: item.id,
        targetPath: '/inventory', openedAt: item.countedAt,
      })
    }

    const openingStock = await this.db
      .select({
        id: openingPositionBatches.id,
        batchNumber: openingPositionBatches.batchNumber,
        submittedAt: openingPositionBatches.submittedAt,
        projectId: openingPositionBatches.projectId,
        projectName: projects.name,
        materialCount: sql<number>`(
          SELECT count(*)::integer FROM ${openingInventoryLines}
          WHERE ${openingInventoryLines.openingPositionBatchId} = ${openingPositionBatches.id})`,
      })
      .from(openingPositionBatches)
      .innerJoin(projects, eq(openingPositionBatches.projectId, projects.id))
      .where(and(
        inArray(openingPositionBatches.projectId, projectIds),
        eq(openingPositionBatches.positionType, OpeningPositionTypes.Inventory),
        eq(openingPositionBatches.status, OpeningPositionStatuses.AwaitingVerification)))
    for (const item of openingStock) {
      const materialCount = Number(item.materialCount)
      this.add(tasks, {
        key: `opening-stock-verification:${item.id}`, type: 'OpeningStockVerification', title: 'Verify opening stock',
        detail: `${materialCount} material${materialCount === 1 ? '' : 's'} · ${item.batchNumber}`,
        requiredRole: 'Supervisor', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'OpeningPositionBatch', sourceId: item.id, targetPath: '/opening-positions',
        openedAt: item.submittedAt, urgent: true,
      })
    }

    const disputedHandovers = await this.db
      .select({
        id: materialIssues.id,
        issueNumber: materialIssues.issueNumber,
        quantityIssued: materialIssues.quantityIssued,
        confirmedQuantity: materialIssues.confirmedQuantity,
        confirmedAt: materialIssues.confirmedAt,
        issuedAt: materialIssues.issuedAt,
        projectId: materialIssues.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        foremanName: users.fullName,
      })
      .from(materialIssues)
      .innerJoin(projects, eq(materialIssues.projectId, projects.id))
      .innerJoin(materials, eq(materialIssues.materialId, materials.id))
      .innerJoin(users, eq(materialIssues.issuedToUserId, users.id))
      .where(and(inArray(materialIssues.projectId, projectIds), eq(materialIssues.status, MaterialIssueStatuses.Disputed)))
    for (const item of disputedHandovers) {
      this.add(tasks, {
        key: `material-handover-dispute:${item.id}`, type: 'MaterialHandoverDispute',
        title: 'Resolve material handover difference',
        detail: `${item.materialName} · issued ${quantity(item.quantityIssued)} ${item.unit}, `
          + `${item.foremanName} received ${quantity(item.confirmedQuantity ?? 0)} ${item.unit}`,
        requiredRole: 'Supervisor', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'MaterialIssue', sourceId: item.id, targetPath: '/custody-close-out',
        openedAt: item.confirmedAt ?? item.issuedAt, urgent: true,
      })
    }

    const closeouts = await this.db
      .select({
        id: materialCustodyCloseouts.id,
        closeoutNumber: materialCustodyCloseouts.closeoutNumber,
        submittedAt: materialCustodyCloseouts.submittedAt,
        projectId: materialIssues.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        confirmedQuantity: materialCustodyCloseouts.confirmedQuantity,
      })
      .from(materialCustodyCloseouts)
      .innerJoin(materialIssues, eq(materialCustodyCloseouts.materialIssueId, materialIssues.id))
      .innerJoin(projects, eq(materialIssues.projectId, projects.id))
      .innerJoin(materials, eq(materialIssues.materialId, materials.id))
      .where(and(
        inArray(materialIssues.projectId, projectIds),
        eq(materialCustodyCloseouts.status, CustodyCloseoutStatuses.AwaitingReview)))
    for (const item of closeouts) {
      this.add(tasks, {
        key: `custody-closeout-review:${item.id}`, type: 'CustodyCloseoutReview', title: 'Review material custody close-out',
        detail: `${quantity(item.confirmedQuantity)} ${item.unit} of ${item.materialName} · ${item.closeoutNumber}`,
        requiredRole: 'Supervisor', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'MaterialCustodyCloseout', sourceId: item.id, targetPath: '/custody-close-out',
        openedAt: item.submittedAt, urgent: true,
      })
    }

    await this.addPeriodSubmissionTasksAsync(tasks, 'Supervisor', OperationalPeriodScopes.Inventory, projectIds)

    const pettyCash = await this.db
      .select({ request: pettyCashRequests, projectName: projects.name })
      .from(pettyCashRequests)
      .innerJoin(projects, eq(pettyCashRequests.projectId, projects.id))
      .where(and(
        eq(pettyCashRequests.requestedByUserId, userId),
        inArray(pettyCashRequests.projectId, projectIds),
        eq(pettyCashRequests.status, PettyCashStatuses.Disbursed)))
    if (pettyCash.length > 0) {
      const ids = pettyCash.map(item => item.request.id)
      const disbursements = await this.db
        .select()
        .from(pettyCashDisbursements)
        .where(inArray(pettyCashDisbursements.pettyCashRequestId, ids))
      const confirmations = await this.db
        .select()
        .from(pettyCashReceiptConfirmations)
        .where(inArray(pettyCashReceiptConfirmations.pettyCashRequestId, ids))
      const reconciliations = await this.db
        .select()
        .from(pettyCashReconciliations)
        .where(inArray(pettyCashReconciliations.pettyCashRequestId, ids))
      for (const { request: item, projectName } of pettyCash) {
        const disbursement = disbursements.find(entry => entry.pettyCashRequestId === item.id)
        if (!disbursement) continue
        const confirmation = confirmations.find(entry => entry.pettyCashRequestId === item.id)
        if (!confirmation) {
          this.add(tasks, {
            key: `petty-receipt:${item.id}`, type: 'PettyCashReceipt', title: 'Confirm petty cash received',
            detail: `${item.purpose} · KES ${money(disbursement.amount)}`, requiredRole: 'Supervisor',
            projectId: item.projectId, projectName, sourceType: 'PettyCashRequest', sourceId: item.id,
            targetPath: '/petty-cash', openedAt: disbursement.disbursedAt, handover: true,
          })
          continue
        }

        const latest = reconciliations
          .filter(entry => entry.pettyCashRequestId === item.id)
          .reduce<(typeof reconciliations)[number] | null>((current, entry) =>
            current === null || entry.submittedAt.getTime() > current.submittedAt.getTime() ? entry : current, null)
        if (latest?.status !== PettyCashReconciliationStatuses.Approved) {
          const revision = latest?.id ?? 0
          const openedAt = latest?.reviewedAt ?? confirmation.confirmedAt
          this.add(tasks, {
            key: `petty-accountability:${item.id}:r${revision}`, type: 'PettyCashAccountability',
            title: 'Submit petty cash accountability', detail: item.purpose, requiredRole: 'Supervisor',
            projectId: item.projectId, projectName, sourceType: 'PettyCashRequest', sourceId: item.id,
            targetPath: '/petty-cash', openedAt, urgent: true,
          })
        }
      }
    }
  }

  private async addEngineerTasksAsync(tasks: MyTaskResponseDto[], projectIds: number[]): Promise<void> {
    const requisitionRows = await this.db
      .select({
        id: requisitions.id,
        workflowRevision: requisitions.workflowRevision,
        quantity: requisitions.quantity,
        purpose: requisitions.purpose,
        updatedAt: requisitions.updatedAt,
        projectId: requisitions.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
      })
      .from(requisitions)
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .where(and(
        inArray(requisitions.projectId, projectIds),
        eq(requisitions.requestType, RequisitionTypes.SiteUse),
        eq(requisitions.status, RequisitionWorkflowStates.AwaitingTechnicalCheck)))
    for (const item of requisitionRows) {
      this.add(tasks, {
        key: `requisition-engineer:${item.id}:r${item.workflowRevision}`, type: 'RequisitionTechnicalCheck',
        title: 'Check material request',
        detail: `${quantity(item.quantity)} ${item.unit} of ${item.materialName} · ${item.purpose}`,
        requiredRole: 'Engineer', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'Requisition', sourceId: item.id, targetPath: '/requisitions', openedAt: item.updatedAt,
      })
    }

    const receipts = await this.db
      .select({
        receipt: goodsReceipts,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        lineQuantity: purchaseOrderLines.quantity,
        supplierName: suppliers.name,
      })
      .from(goodsReceipts)
      .innerJoin(purchaseOrderLines, eq(goodsReceipts.purchaseOrderLineId, purchaseOrderLines.id))
      .innerJoin(projects, eq(goodsReceipts.projectId, projects.id))
      .innerJoin(materials, eq(goodsReceipts.materialId, materials.id))
      .innerJoin(purchaseOrders, eq(goodsReceipts.purchaseOrderId, purchaseOrders.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(
        inArray(goodsReceipts.projectId, projectIds),
        gt(goodsReceipts.acceptedQuantity, 0),
        eq(purchaseOrderLines.requiresTechnicalAcceptance, true)))
    const reviews = receipts.length === 0
      ? []
      : await this.db
        .select()
        .from(goodsReceiptTechnicalAcceptances)
        .where(inArray(goodsReceiptTechnicalAcceptances.goodsReceiptId, receipts.map(item => item.receipt.id)))
    const latestReview = (receiptId: number) => latestBySequence(reviews.filter(review => review.goodsReceiptId === receiptId))
    const postedReceiptIds = new Set((await this.db
      .select({ referenceId: stockLedgerEntries.referenceId })
      .from(stockLedgerEntries)
      .where(and(
        eq(stockLedgerEntries.movementType, 'Receipt'),
        eq(stockLedgerEntries.referenceType, 'GoodsReceipt'),
        gt(stockLedgerEntries.quantityDelta, 0)))).map(entry => entry.referenceId))
    const technicallyAcceptedByLine = new Map<number, Decimal>()
    for (const item of receipts) {
      if (latestReview(item.receipt.id)?.outcome !== TechnicalAcceptanceOutcomes.Accepted) continue
      const lineId = item.receipt.purchaseOrderLineId
      technicallyAcceptedByLine.set(lineId, (technicallyAcceptedByLine.get(lineId) ?? dec(0)).plus(item.receipt.acceptedQuantity))
    }
    for (const item of receipts.filter(entry => !postedReceiptIds.has(entry.receipt.id))) {
      const latest = latestReview(item.receipt.id)
      if (latest?.outcome === TechnicalAcceptanceOutcomes.Accepted) continue
      if ((technicallyAcceptedByLine.get(item.receipt.purchaseOrderLineId) ?? dec(0)).gte(item.lineQuantity)) continue
      const sequence = (latest?.reviewSequence ?? 0) + 1
      this.add(tasks, {
        key: `delivery-acceptance:${item.receipt.id}:r${sequence}`, type: 'DeliveryTechnicalAcceptance',
        title: latest?.outcome === TechnicalAcceptanceOutcomes.Rejected ? 'Recheck delivered material' : 'Check delivered material',
        detail: `${quantity(item.receipt.acceptedQuantity)} ${item.unit} of ${item.materialName} · ${item.supplierName}`,
        requiredRole: 'Engineer', projectId: item.receipt.projectId, projectName: item.projectName,
        sourceType: 'GoodsReceipt', sourceId: item.receipt.id, targetPath: '/delivery-checks',
        openedAt: latest?.reviewedAt ?? item.receipt.receivedAt, urgent: true,
      })
    }
  }

  private async addForemanTasksAsync(tasks: MyTaskResponseDto[], userId: number, projectIds: number[]): Promise<void> {
    const returned = await this.db
      .select({
        id: requisitions.id,
        workflowRevision: requisitions.workflowRevision,
        updatedAt: requisitions.updatedAt,
        projectId: requisitions.projectId,
        projectName: projects.name,
        materialName: materials.name,
      })
      .from(requisitions)
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .where(and(
        eq(requisitions.requestedByUserId, userId),
        inArray(requisitions.projectId, projectIds),
        eq(requisitions.status, RequisitionWorkflowStates.ReturnedForRevision)))
    for (const item of returned) {
      this.add(tasks, {
        key: `requisition-revise:${item.id}:r${item.workflowRevision}`, type: 'RequisitionRevision',
        title: 'Revise material request', detail: item.materialName, requiredRole: 'Foreman',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'Requisition', sourceId: item.id,
        targetPath: '/requisitions', openedAt: item.updatedAt,
      })
    }

    const issues = await this.db
      .select({ issue: materialIssues, projectName: projects.name, materialName: materials.name, unit: materials.unit })
      .from(materialIssues)
      .innerJoin(projects, eq(materialIssues.projectId, projects.id))
      .innerJoin(materials, eq(materialIssues.materialId, materials.id))
      .where(and(
        eq(materialIssues.issuedToUserId, userId),
        inArray(materialIssues.projectId, projectIds),
        inArray(materialIssues.status, [MaterialIssueStatuses.AwaitingConfirmation, MaterialIssueStatuses.Confirmed])))
    if (issues.length === 0) return
    const issueIds = issues.map(item => item.issue.id)
    const usage = await this.db
      .select({ materialIssueId: materialUsageRecords.materialIssueId, quantity: materialUsageRecords.quantity })
      .from(materialUsageRecords)
      .where(inArray(materialUsageRecords.materialIssueId, issueIds))
    const returns = await this.db
      .select({
        materialIssueId: materialReturns.materialIssueId,
        status: materialReturns.status,
        quantityAccepted: materialReturns.quantityAccepted,
        quantityOffered: materialReturns.quantityOffered,
      })
      .from(materialReturns)
      .where(inArray(materialReturns.materialIssueId, issueIds))
    const closeouts = await this.db
      .select({
        materialIssueId: materialCustodyCloseouts.materialIssueId,
        revision: materialCustodyCloseouts.revision,
        status: materialCustodyCloseouts.status,
        decidedAt: materialCustodyCloseoutDecisions.decidedAt,
      })
      .from(materialCustodyCloseouts)
      .leftJoin(materialCustodyCloseoutDecisions,
        eq(materialCustodyCloseoutDecisions.materialCustodyCloseoutId, materialCustodyCloseouts.id))
      .where(inArray(materialCustodyCloseouts.materialIssueId, issueIds))

    for (const { issue: item, projectName, materialName, unit } of issues) {
      if (item.status === MaterialIssueStatuses.AwaitingConfirmation) {
        this.add(tasks, {
          key: `material-handover:${item.id}`, type: 'MaterialHandoverConfirmation', title: 'Confirm materials received',
          detail: `${quantity(item.quantityIssued)} ${unit} of ${materialName}`, requiredRole: 'Foreman',
          projectId: item.projectId, projectName, sourceType: 'MaterialIssue', sourceId: item.id,
          targetPath: '/inventory', openedAt: item.issuedAt, handover: true,
        })
        continue
      }

      const issueReturns = returns.filter(entry => entry.materialIssueId === item.id)
      const accounted = sum(usage.filter(entry => entry.materialIssueId === item.id).map(entry => entry.quantity))
        .plus(sum(issueReturns
          .filter(entry => entry.status === MaterialReturnStatuses.Received)
          .map(entry => entry.quantityAccepted ?? 0)))
      const pendingReturn = sum(issueReturns
        .filter(entry => entry.status === MaterialReturnStatuses.AwaitingReceipt)
        .map(entry => entry.quantityOffered))
      const confirmed = dec(item.confirmedQuantity ?? 0)
      const available = confirmed.minus(accounted).minus(pendingReturn)
      if (available.gt(0)) {
        this.add(tasks, {
          key: `material-accountability:${item.id}`, type: 'MaterialAccountability', title: 'Record material use',
          detail: `${quantity(available)} ${unit} of ${materialName} remaining`, requiredRole: 'Foreman',
          projectId: item.projectId, projectName, sourceType: 'MaterialIssue', sourceId: item.id,
          targetPath: '/inventory', openedAt: item.confirmedAt ?? item.issuedAt,
        })
        continue
      }

      const latestCloseout = closeouts
        .filter(entry => entry.materialIssueId === item.id)
        .reduce<(typeof closeouts)[number] | null>((current, entry) =>
          current === null || entry.revision > current.revision ? entry : current, null)
      if (pendingReturn.gt(0)
        || latestCloseout?.status === CustodyCloseoutStatuses.AwaitingReview
        || latestCloseout?.status === CustodyCloseoutStatuses.Approved) {
        continue
      }

      const revision = (latestCloseout?.revision ?? 0) + 1
      this.add(tasks, {
        key: `custody-closeout-submit:${item.id}:r${revision}`, type: 'CustodyCloseoutSubmission',
        title: latestCloseout?.status === CustodyCloseoutStatuses.Returned
          ? 'Resubmit material custody close-out'
          : 'Submit material custody close-out',
        detail: `${quantity(confirmed)} ${unit} of ${materialName}`, requiredRole: 'Foreman',
        projectId: item.projectId, projectName, sourceType: 'MaterialIssue', sourceId: item.id,
        targetPath: '/custody-close-out',
        openedAt: latestCloseout?.decidedAt ?? item.confirmedAt ?? item.issuedAt, urgent: true,
      })
    }
  }

  private async addStorekeeperTasksAsync(tasks: MyTaskResponseDto[], userId: number, projectIds: number[]): Promise<void> {
    const issueRequests = await this.db
      .select({
        id: requisitions.id,
        quantity: requisitions.quantity,
        approvedAt: requisitions.approvedAt,
        updatedAt: requisitions.updatedAt,
        projectId: requisitions.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        foremanName: users.fullName,
      })
      .from(requisitions)
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .innerJoin(users, eq(requisitions.requestedByUserId, users.id))
      .where(and(
        inArray(requisitions.projectId, projectIds),
        eq(requisitions.requestType, RequisitionTypes.SiteUse),
        eq(requisitions.status, RequisitionWorkflowStates.Approved),
        not(exists(this.db.select({ one: sql`1` }).from(materialIssues).where(eq(materialIssues.requisitionId, requisitions.id)))),
        exists(this.db
          .select({ one: sql`1` })
          .from(stockBalances)
          .where(and(
            eq(stockBalances.projectId, requisitions.projectId),
            eq(stockBalances.materialId, requisitions.materialId),
            gte(stockBalances.quantityOnHand, requisitions.quantity))))))
    for (const item of issueRequests) {
      this.add(tasks, {
        key: `material-issue:${item.id}`, type: 'MaterialIssue', title: 'Issue approved materials',
        detail: `${quantity(item.quantity)} ${item.unit} of ${item.materialName} to ${item.foremanName}`,
        requiredRole: 'Storekeeper', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'Requisition', sourceId: item.id, targetPath: '/inventory',
        openedAt: item.approvedAt ?? item.updatedAt, urgent: true,
      })
    }

    const orders = await this.db
      .select({ order: purchaseOrders, projectName: projects.name, supplierName: suppliers.name })
      .from(purchaseOrders)
      .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(inArray(purchaseOrders.projectId, projectIds), eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Issued)))
    const orderDetails = await this.loadOrderLinesAndReceiptsAsync(orders.map(item => item.order.id))
    for (const { order, projectName, supplierName } of orders) {
      const details = orderDetails(order.id)
      const line = PurchaseOrderInvariant.requireSingleLine({ lines: details.lines })
      const committed = sum(details.receipts
        .filter(receipt => dec(receipt.acceptedQuantity).gt(0)
          && latestBySequence(receipt.reviews)?.outcome !== TechnicalAcceptanceOutcomes.Rejected)
        .map(receipt => receipt.acceptedQuantity))
      const remaining = dec(line.quantity).minus(committed)
      if (remaining.lte(0)) continue
      const revision = details.receipts.length + details.receipts.reduce((total, receipt) => total + receipt.reviews.length, 0)
      const moments = details.receipts.flatMap(receipt => [
        ...receipt.reviews.map(review => review.reviewedAt),
        receipt.receivedAt,
      ])
      const openedAt = moments.length === 0
        ? order.issuedAt ?? order.approvedAt ?? order.createdAt
        : new Date(Math.max(...moments.map(moment => moment.getTime())))
      this.add(tasks, {
        key: `goods-receipt:${order.id}:r${revision}`, type: 'GoodsReceipt', title: 'Receive supplier delivery',
        detail: `${quantity(remaining)} ${line.materialUnit} of ${line.materialName} · ${supplierName}`,
        requiredRole: 'Storekeeper', projectId: order.projectId, projectName,
        sourceType: 'PurchaseOrder', sourceId: order.id, targetPath: '/inventory', openedAt, urgent: true,
      })
    }

    const transfers = await this.db
      .select({
        transfer: stockTransfers,
        fromProjectName: fromProject.name,
        toProjectName: toProject.name,
        materialName: materials.name,
        unit: materials.unit,
      })
      .from(stockTransfers)
      .innerJoin(fromProject, eq(stockTransfers.fromProjectId, fromProject.id))
      .innerJoin(toProject, eq(stockTransfers.toProjectId, toProject.id))
      .innerJoin(materials, eq(stockTransfers.materialId, materials.id))
      .where(or(
        and(
          eq(stockTransfers.status, StockTransferStatuses.PendingDispatch),
          inArray(stockTransfers.fromProjectId, projectIds)),
        and(
          eq(stockTransfers.status, StockTransferStatuses.InTransit),
          inArray(stockTransfers.toProjectId, projectIds),
          // C# `DispatchedByUserId != userId` is null-safe; SQL `<>` alone would drop NULLs.
          sql`${stockTransfers.dispatchedByUserId} IS DISTINCT FROM ${userId}`)))
    for (const { transfer: item, fromProjectName, toProjectName, materialName, unit } of transfers) {
      const receive = item.status === StockTransferStatuses.InTransit
      this.add(tasks, {
        key: `stock-transfer-${receive ? 'receive' : 'dispatch'}:${item.id}`,
        type: receive ? 'StockTransferReceipt' : 'StockTransferDispatch',
        title: receive ? 'Receive stock transfer' : 'Dispatch stock transfer',
        detail: `${quantity(item.quantity)} ${unit} of ${materialName} · ${fromProjectName} to ${toProjectName}`,
        requiredRole: 'Storekeeper',
        projectId: receive ? item.toProjectId : item.fromProjectId,
        projectName: receive ? toProjectName : fromProjectName,
        sourceType: 'StockTransfer', sourceId: item.id, targetPath: '/inventory',
        openedAt: receive ? item.dispatchedAt ?? item.requestedAt : item.requestedAt, urgent: true,
      })
    }

    const returns = await this.db
      .select({
        id: materialReturns.id,
        returnNumber: materialReturns.returnNumber,
        quantityOffered: materialReturns.quantityOffered,
        returnedAt: materialReturns.returnedAt,
        projectId: materialIssues.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        foremanName: users.fullName,
      })
      .from(materialReturns)
      .innerJoin(materialIssues, eq(materialReturns.materialIssueId, materialIssues.id))
      .innerJoin(projects, eq(materialIssues.projectId, projects.id))
      .innerJoin(materials, eq(materialIssues.materialId, materials.id))
      .innerJoin(users, eq(materialReturns.returnedByUserId, users.id))
      .where(and(
        inArray(materialIssues.projectId, projectIds),
        eq(materialReturns.status, MaterialReturnStatuses.AwaitingReceipt),
        ne(materialReturns.returnedByUserId, userId)))
    for (const item of returns) {
      this.add(tasks, {
        key: `material-return-receive:${item.id}`, type: 'MaterialReturnReceipt', title: 'Receive returned material',
        detail: `${quantity(item.quantityOffered)} ${item.unit} of ${item.materialName} from ${item.foremanName}`,
        requiredRole: 'Storekeeper', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'MaterialReturn', sourceId: item.id, targetPath: '/custody-close-out',
        openedAt: item.returnedAt, handover: true,
      })
    }
  }

  private async addProcurementTasksAsync(tasks: MyTaskResponseDto[], userId: number, projectIds: number[]): Promise<void> {
    const catalogRequests = await this.db
      .select({
        id: materialCatalogRequests.id,
        name: materialCatalogRequests.name,
        unit: materialCatalogRequests.unit,
        submittedAt: materialCatalogRequests.submittedAt,
        projectId: materialCatalogRequests.projectId,
        projectName: projects.name,
      })
      .from(materialCatalogRequests)
      .innerJoin(projects, eq(materialCatalogRequests.projectId, projects.id))
      .where(and(
        eq(materialCatalogRequests.status, MaterialCatalogRequestStatuses.Pending),
        inArray(materialCatalogRequests.projectId, projectIds)))
    for (const item of catalogRequests) {
      this.add(tasks, {
        key: `material-catalog-review:${item.id}`, type: 'MaterialCatalogReview', title: 'Review material',
        detail: `${item.name} · ${item.unit}`, requiredRole: 'Procurement Officer',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'MaterialCatalogRequest', sourceId: item.id,
        targetPath: '/sourcing?section=catalog', openedAt: item.submittedAt,
      })
    }

    const liveOrderStatuses = [
      PurchaseOrderWorkflowStates.Draft,
      PurchaseOrderWorkflowStates.Submitted,
      PurchaseOrderWorkflowStates.Approved,
      PurchaseOrderWorkflowStates.Issued,
    ]
    const requisitionRows = await this.db
      .select({
        id: requisitions.id,
        quantity: requisitions.quantity,
        approvedAt: requisitions.approvedAt,
        updatedAt: requisitions.updatedAt,
        projectId: requisitions.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
      })
      .from(requisitions)
      .innerJoin(projects, eq(requisitions.projectId, projects.id))
      .innerJoin(materials, eq(requisitions.materialId, materials.id))
      .where(and(
        inArray(requisitions.projectId, projectIds),
        eq(requisitions.status, RequisitionWorkflowStates.Approved),
        not(exists(this.db
          .select({ one: sql`1` })
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.requisitionId, requisitions.id), inArray(purchaseOrders.status, liveOrderStatuses))))),
        or(
          eq(requisitions.requestType, RequisitionTypes.StockReplenishment),
          not(exists(this.db
            .select({ one: sql`1` })
            .from(stockBalances)
            .where(and(
              eq(stockBalances.projectId, requisitions.projectId),
              eq(stockBalances.materialId, requisitions.materialId),
              gte(stockBalances.quantityOnHand, requisitions.quantity))))))))
    for (const item of requisitionRows) {
      this.add(tasks, {
        key: `open-sourcing:${item.id}`, type: 'OpenSourcing', title: 'Order from a supplier',
        detail: `${quantity(item.quantity)} ${item.unit} of ${item.materialName}`, requiredRole: 'Procurement Officer',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'Requisition', sourceId: item.id,
        targetPath: '/sourcing', openedAt: item.approvedAt ?? item.updatedAt,
      })
    }

    const orders = await this.db
      .select({
        id: purchaseOrders.id,
        status: purchaseOrders.status,
        purchaseOrderNumber: purchaseOrders.purchaseOrderNumber,
        createdAt: purchaseOrders.createdAt,
        approvedAt: purchaseOrders.approvedAt,
        projectId: purchaseOrders.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
      })
      .from(purchaseOrders)
      .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(
        inArray(purchaseOrders.projectId, projectIds),
        or(
          and(eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Draft), eq(purchaseOrders.createdByUserId, userId)),
          eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Approved))))
    for (const item of orders) {
      const issue = item.status === PurchaseOrderWorkflowStates.Approved
      this.add(tasks, {
        key: `po-${issue ? 'issue' : 'draft'}:${item.id}`,
        type: issue ? 'IssuePurchaseOrder' : 'SubmitPurchaseOrder',
        title: issue ? 'Send purchase order' : 'Approve purchase order',
        detail: `${item.supplierName} · ${item.purchaseOrderNumber}`, requiredRole: 'Procurement Officer',
        projectId: item.projectId, projectName: item.projectName, sourceType: 'PurchaseOrder', sourceId: item.id,
        targetPath: '/purchase-orders', openedAt: issue ? item.approvedAt ?? item.createdAt : item.createdAt,
      })
    }

    const activeInvoiceStatuses = [
      InvoiceStatuses.PendingReview,
      InvoiceStatuses.Matched,
      InvoiceStatuses.AwaitingCeoApproval,
      InvoiceStatuses.ReadyForAuthorization,
      InvoiceStatuses.Authorized,
      InvoiceStatuses.Paid,
    ]
    const invoiceOrders = await this.db
      .select({ order: purchaseOrders, projectName: projects.name, supplierName: suppliers.name })
      .from(purchaseOrders)
      .innerJoin(projects, eq(purchaseOrders.projectId, projects.id))
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(
        inArray(purchaseOrders.projectId, projectIds),
        eq(purchaseOrders.status, PurchaseOrderWorkflowStates.Issued),
        not(exists(this.db
          .select({ one: sql`1` })
          .from(supplierInvoices)
          .where(and(
            eq(supplierInvoices.purchaseOrderId, purchaseOrders.id),
            inArray(supplierInvoices.status, activeInvoiceStatuses)))))))
    const invoiceOrderDetails = await this.loadOrderLinesAndReceiptsAsync(invoiceOrders.map(item => item.order.id))
    for (const { order, projectName, supplierName } of invoiceOrders) {
      const details = invoiceOrderDetails(order.id)
      const line = PurchaseOrderInvariant.requireSingleLine({ lines: details.lines })
      const openedAt = details.receipts.length === 0
        ? order.issuedAt ?? order.createdAt
        : new Date(Math.max(...details.receipts.map(receipt => receipt.receivedAt.getTime())))
      this.add(tasks, {
        key: `capture-invoice:${order.id}`, type: 'CaptureSupplierInvoice', title: 'Capture supplier invoice',
        detail: `${supplierName} · ${line.materialName}`, requiredRole: 'Procurement Officer',
        projectId: order.projectId, projectName, sourceType: 'PurchaseOrder', sourceId: order.id,
        targetPath: '/finance', openedAt, urgent: true,
      })
    }
  }

  private async addFinanceTasksAsync(tasks: MyTaskResponseDto[], projectIds: number[]): Promise<void> {
    const invoices = await this.db
      .select({
        id: supplierInvoices.id,
        invoiceNumber: supplierInvoices.invoiceNumber,
        amount: supplierInvoices.amount,
        capturedAt: supplierInvoices.capturedAt,
        projectId: supplierInvoices.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
      })
      .from(supplierInvoices)
      .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(inArray(supplierInvoices.projectId, projectIds), eq(supplierInvoices.status, InvoiceStatuses.PendingReview)))
    for (const item of invoices) {
      this.add(tasks, {
        key: `invoice-match:${item.id}`, type: 'InvoiceMatch', title: 'Run invoice match',
        detail: `${item.supplierName} · Invoice ${item.invoiceNumber} · KES ${money(item.amount)}`,
        requiredRole: 'Finance Officer', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'SupplierInvoice', sourceId: item.id, targetPath: '/finance', openedAt: item.capturedAt, urgent: true,
      })
    }

    const authorizations = await this.db
      .select({
        id: paymentAuthorizations.id,
        amount: paymentAuthorizations.amount,
        authorizedAt: paymentAuthorizations.authorizedAt,
        projectId: supplierInvoices.projectId,
        projectName: projects.name,
        supplierName: suppliers.name,
        invoiceNumber: supplierInvoices.invoiceNumber,
      })
      .from(paymentAuthorizations)
      .innerJoin(supplierInvoices, eq(paymentAuthorizations.supplierInvoiceId, supplierInvoices.id))
      .innerJoin(projects, eq(supplierInvoices.projectId, projects.id))
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(
        inArray(supplierInvoices.projectId, projectIds),
        not(exists(this.db
          .select({ one: sql`1` })
          .from(payments)
          .where(eq(payments.paymentAuthorizationId, paymentAuthorizations.id))))))
    for (const item of authorizations) {
      this.add(tasks, {
        key: `payment-execute:${item.id}`, type: 'PaymentExecution', title: 'Pay authorized supplier',
        detail: `${item.supplierName} · Invoice ${item.invoiceNumber} · KES ${money(item.amount)}`,
        requiredRole: 'Finance Officer', projectId: item.projectId, projectName: item.projectName,
        sourceType: 'PaymentAuthorization', sourceId: item.id, targetPath: '/finance',
        openedAt: item.authorizedAt, urgent: true,
      })
    }

    const pettyCash = await this.db
      .select({ request: pettyCashRequests, projectName: projects.name })
      .from(pettyCashRequests)
      .innerJoin(projects, eq(pettyCashRequests.projectId, projects.id))
      .where(and(
        inArray(pettyCashRequests.projectId, projectIds),
        inArray(pettyCashRequests.status, [
          PettyCashStatuses.PendingFinanceApproval,
          PettyCashStatuses.Approved,
          PettyCashStatuses.ReconciliationSubmitted,
        ])))
    const reconciliations = pettyCash.length === 0
      ? []
      : await this.db
        .select()
        .from(pettyCashReconciliations)
        .where(inArray(pettyCashReconciliations.pettyCashRequestId, pettyCash.map(item => item.request.id)))
    for (const { request: item, projectName } of pettyCash) {
      if (item.status === PettyCashStatuses.PendingFinanceApproval) {
        this.add(tasks, {
          key: `petty-decision:${item.id}`, type: 'PettyCashDecision', title: 'Review petty cash request',
          detail: `${item.purpose} · KES ${money(item.amountRequested)}`, requiredRole: 'Finance Officer',
          projectId: item.projectId, projectName, sourceType: 'PettyCashRequest', sourceId: item.id,
          targetPath: '/petty-cash', openedAt: item.requestedAt, urgent: true,
        })
      } else if (item.status === PettyCashStatuses.Approved) {
        this.add(tasks, {
          key: `petty-disburse:${item.id}`, type: 'PettyCashDisbursement', title: 'Disburse petty cash',
          detail: `${item.purpose} · KES ${money(item.amountApproved ?? item.amountRequested)}`, requiredRole: 'Finance Officer',
          projectId: item.projectId, projectName, sourceType: 'PettyCashRequest', sourceId: item.id,
          targetPath: '/petty-cash', openedAt: item.financeDecisionAt ?? item.requestedAt, urgent: true,
        })
      } else {
        const pending = reconciliations.filter(entry =>
          entry.pettyCashRequestId === item.id && entry.status === PettyCashReconciliationStatuses.PendingReview)
        if (pending.length !== 1) {
          throw new Error(pending.length === 0
            ? 'Sequence contains no matching element'
            : 'Sequence contains more than one matching element')
        }
        this.add(tasks, {
          key: `petty-reconciliation:${pending[0]!.id}`, type: 'PettyCashReconciliationReview',
          title: 'Review petty cash accountability', detail: item.purpose, requiredRole: 'Finance Officer',
          projectId: item.projectId, projectName, sourceType: 'PettyCashReconciliation', sourceId: pending[0]!.id,
          targetPath: '/petty-cash', openedAt: pending[0]!.submittedAt, urgent: true,
        })
      }
    }

    await this.addPeriodSubmissionTasksAsync(tasks, 'Finance Officer', OperationalPeriodScopes.Finance, projectIds)
  }

  private async addPeriodSubmissionTasksAsync(
    tasks: MyTaskResponseDto[],
    requiredRole: string,
    scope: string,
    projectIds: number[],
  ): Promise<void> {
    const today = businessToday()
    const periods = await this.loadPeriodsWithLatestEventAsync(and(
      inArray(operationalPeriods.projectId, projectIds),
      eq(operationalPeriods.scope, scope),
      inArray(operationalPeriods.status, [OperationalPeriodStatuses.Open, OperationalPeriodStatuses.Returned]),
      lt(operationalPeriods.endDate, today)))
    for (const item of periods) {
      const latest = item.latest
      if (latest === null) throw new Error('Sequence contains no elements')
      const returned = item.period.status === OperationalPeriodStatuses.Returned
      this.add(tasks, {
        key: `period-close-submit:${item.period.id}:r${latest.sequenceNumber}`,
        type: 'OperationalPeriodCloseSubmission',
        title: returned ? 'Resubmit period close' : 'Submit period close',
        detail: `${item.period.scope} · ${item.period.name}`, requiredRole,
        projectId: item.period.projectId, projectName: item.projectName,
        sourceType: 'OperationalPeriod', sourceId: item.period.id, targetPath: '/period-close',
        openedAt: returned ? latest.occurredAt : businessDayEndExclusiveUtc(item.period.endDate), urgent: true,
      })
    }
  }

  private async loadPeriodsWithLatestEventAsync(filter: SQL | undefined) {
    const periods = await this.db
      .select({ period: operationalPeriods, projectName: projects.name })
      .from(operationalPeriods)
      .innerJoin(projects, eq(operationalPeriods.projectId, projects.id))
      .where(filter)
    if (periods.length === 0) return []
    const events = await this.db
      .select({
        operationalPeriodId: operationalPeriodEvents.operationalPeriodId,
        sequenceNumber: operationalPeriodEvents.sequenceNumber,
        occurredAt: operationalPeriodEvents.occurredAt,
      })
      .from(operationalPeriodEvents)
      .where(inArray(operationalPeriodEvents.operationalPeriodId, periods.map(item => item.period.id)))
    return periods.map(item => ({
      ...item,
      latest: latestBySequence(events
        .filter(event => event.operationalPeriodId === item.period.id)
        .map(event => ({ ...event, reviewSequence: event.sequenceNumber }))),
    }))
  }

  /** `.Include(Lines).ThenInclude(Material)` and `.Include(GoodsReceipts).ThenInclude(TechnicalAcceptances)`. */
  private async loadOrderLinesAndReceiptsAsync(orderIds: number[]) {
    const lines = orderIds.length === 0
      ? []
      : await this.db
        .select({
          purchaseOrderId: purchaseOrderLines.purchaseOrderId,
          quantity: purchaseOrderLines.quantity,
          materialName: materials.name,
          materialUnit: materials.unit,
        })
        .from(purchaseOrderLines)
        .innerJoin(materials, eq(purchaseOrderLines.materialId, materials.id))
        .where(inArray(purchaseOrderLines.purchaseOrderId, orderIds))
        .orderBy(asc(purchaseOrderLines.id))
    const receipts = orderIds.length === 0
      ? []
      : await this.db
        .select({
          id: goodsReceipts.id,
          purchaseOrderId: goodsReceipts.purchaseOrderId,
          acceptedQuantity: goodsReceipts.acceptedQuantity,
          receivedAt: goodsReceipts.receivedAt,
        })
        .from(goodsReceipts)
        .where(inArray(goodsReceipts.purchaseOrderId, orderIds))
    const reviews = receipts.length === 0
      ? []
      : await this.db
        .select({
          goodsReceiptId: goodsReceiptTechnicalAcceptances.goodsReceiptId,
          reviewSequence: goodsReceiptTechnicalAcceptances.reviewSequence,
          outcome: goodsReceiptTechnicalAcceptances.outcome,
          reviewedAt: goodsReceiptTechnicalAcceptances.reviewedAt,
        })
        .from(goodsReceiptTechnicalAcceptances)
        .where(inArray(goodsReceiptTechnicalAcceptances.goodsReceiptId, receipts.map(item => item.id)))
    return (orderId: number) => ({
      lines: lines.filter(line => line.purchaseOrderId === orderId),
      receipts: receipts
        .filter(receipt => receipt.purchaseOrderId === orderId)
        .map(receipt => ({ ...receipt, reviews: reviews.filter(review => review.goodsReceiptId === receipt.id) })),
    })
  }

  private add(tasks: MyTaskResponseDto[], task: TaskInput): void {
    const hours = task.handover
      ? positiveHours(this.options.handoverDueHours, 12)
      : task.urgent
        ? positiveHours(this.options.urgentDueHours, 24)
        : positiveHours(this.options.defaultDueHours, 48)
    tasks.push({
      taskKey: task.key,
      taskType: task.type,
      title: task.title,
      detail: task.detail,
      requiredRole: task.requiredRole,
      projectId: task.projectId,
      projectName: task.projectName,
      sourceEntityType: task.sourceType,
      sourceEntityId: task.sourceId,
      targetPath: task.targetPath,
      openedAt: task.openedAt,
      dueAt: task.dueAt ?? new Date(task.openedAt.getTime() + hours * HourMs),
      isOverdue: false,
      priority: task.urgent || task.handover ? 'High' : 'Normal',
    })
  }
}

function latestBySequence<T extends { reviewSequence: number }>(items: T[]): T | null {
  return items.reduce<T | null>((latest, item) =>
    latest === null || item.reviewSequence > latest.reviewSequence ? item : latest, null)
}

function positiveHours(configured: number, fallback: number): number {
  return configured > 0 ? configured : fallback
}

/** `amount.ToString("N2", CultureInfo.InvariantCulture)` */
function money(amount: number): string {
  return formatNumber(amount, 2)
}

/** `amount.ToString("0.###", CultureInfo.InvariantCulture)` */
function quantity(amount: Decimal.Value): string {
  return dec(amount).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed()
}

/** .NET `DateTime.Ticks` (100 ns units since 0001-01-01) of a UTC instant. */
export function ticks(value: Date): string {
  return ((BigInt(value.getTime()) + 62_135_596_800_000n) * 10_000n).toString()
}

function businessToday(): string {
  return new Date(Date.now() + BusinessUtcOffsetMs).toISOString().slice(0, 10)
}

function businessDayEndExclusiveUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + 1) - BusinessUtcOffsetMs)
}

