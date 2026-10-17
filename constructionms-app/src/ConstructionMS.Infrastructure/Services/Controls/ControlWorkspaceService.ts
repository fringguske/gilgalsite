import { randomInt } from 'node:crypto'
import { and, asc, count, desc, eq, exists, gt, gte, inArray, lt, lte, max, ne, not, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { DecimalPrecision } from '@/ConstructionMS.Application/Common/DecimalPrecisionAttribute'
import {
  ArgumentError,
  ArgumentOutOfRangeError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { Decimal, dec, toNumber } from '@/ConstructionMS.Application/Common/Money'
import type {
  CashAccountResponseDto,
  ControlledCorrectionResponseDto,
  CorrectionDecisionRequestDto,
  CreateControlledCorrectionRequestDto,
  CreateMaterialReturnRequestDto,
  CreateOpeningPositionRequestDto,
  CreateOperationalPeriodRequestDto,
  CustodyCloseoutResponseDto,
  MaterialIssueDisputeResolutionResponseDto,
  MaterialReturnResponseDto,
  OpeningPositionDecisionRequestDto,
  OpeningPositionResponseDto,
  OperationalPeriodResponseDto,
  PeriodActionRequestDto,
  PeriodDecisionRequestDto,
  ReceiveMaterialReturnRequestDto,
  ResolveMaterialIssueDisputeRequestDto,
  ReviewCustodyCloseoutRequestDto,
  SubmitCustodyCloseoutRequestDto,
} from '@/ConstructionMS.Application/DTOs/Controls/ControlWorkspaceDtos'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IControlWorkspaceService } from '@/ConstructionMS.Application/Services/Controls/IControlWorkspaceService'
import {
  ControlledCorrectionStatuses,
  ControlledCorrectionTypes,
  CustodyCloseoutStatuses,
  MaterialReturnStatuses,
  OpeningPositionStatuses,
  OpeningPositionTypes,
  OperationalPeriodScopes,
  OperationalPeriodStatuses,
} from '@/ConstructionMS.Domain/Entities/ControlWorkspaceEntities'
import { InvoiceStatuses, PettyCashStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import {
  MaterialIssueStatuses,
  StockCountStatuses,
  StockTransferStatuses,
  TechnicalAcceptanceOutcomes,
} from '@/ConstructionMS.Domain/Entities/InventoryEntities'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { compareCultureStrings } from '../../Common/StringComparison'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  cashAccounts,
  cashLedgerEntries,
  controlledCorrectionDecisions,
  controlledCorrections,
  goodsReceipts,
  materialCustodyCloseoutDecisions,
  materialCustodyCloseouts,
  materialIssueDisputeResolutions,
  materialIssues,
  materialReturns,
  materialUsageRecords,
  materials,
  openingCashLines,
  openingInventoryLines,
  openingPositionBatches,
  openingPositionDecisions,
  openingPositionPostings,
  openingPositionVerifications,
  operationalPeriodEvents,
  operationalPeriods,
  pettyCashRequests,
  projects,
  purchaseOrderLines,
  stockBalances,
  stockCounts,
  stockLedgerEntries,
  stockTransfers,
  supplierInvoices,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { ControlEventWriter } from '../ControlEventWriter'

type OpeningPositionBatchRow = typeof openingPositionBatches.$inferSelect
type OperationalPeriodRow = typeof operationalPeriods.$inferSelect

const BusinessUtcOffsetMs = 3 * 60 * 60 * 1000
const Serializable = { isolationLevel: IsolationLevel.Serializable } as const

const submittedByUser = alias(users, 'submitted_by_user')
const decidedByUser = alias(users, 'decided_by_user')
const returnedByUser = alias(users, 'returned_by_user')
const receivedByUser = alias(users, 'received_by_user')

const latestReviewOutcome = sql<string | null>`(
  SELECT review."Outcome" FROM "GoodsReceiptTechnicalAcceptances" AS review
  WHERE review."GoodsReceiptId" = ${goodsReceipts.id}
  ORDER BY review."ReviewSequence" DESC
  LIMIT 1)`

export class ControlWorkspaceService implements IControlWorkspaceService {
  private readonly events: ControlEventWriter

  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
  ) {
    this.events = new ControlEventWriter(db)
  }

  async getCashAccountsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<CashAccountResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      await this.scopeByProjectAsync(actorUserId, actorRole, cashAccounts.projectId),
      projectId !== null ? eq(cashAccounts.projectId, projectId) : undefined)
    const rows = await this.db
      .select({
        id: cashAccounts.id,
        projectId: cashAccounts.projectId,
        projectName: projects.name,
        name: cashAccounts.name,
        balance: cashAccounts.balance,
        updatedAt: cashAccounts.updatedAt,
      })
      .from(cashAccounts)
      .innerJoin(projects, eq(cashAccounts.projectId, projects.id))
      .where(filter)
      .orderBy(asc(projects.name), asc(cashAccounts.name))
    return rows
  }

  async getOpeningPositionsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<OpeningPositionResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      await this.scopeByProjectAsync(actorUserId, actorRole, openingPositionBatches.projectId),
      actorRole === 'Storekeeper' || actorRole === 'Supervisor'
        ? eq(openingPositionBatches.positionType, OpeningPositionTypes.Inventory)
        : actorRole === 'Finance Officer'
          ? eq(openingPositionBatches.positionType, OpeningPositionTypes.Cash)
          : undefined,
      projectId !== null ? eq(openingPositionBatches.projectId, projectId) : undefined)
    return await loadOpeningPositionsAsync(this.db, filter, { orderBy: [desc(openingPositionBatches.submittedAt)], limit: 250 })
  }

  async createOpeningPositionAsync(
    request: CreateOpeningPositionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OpeningPositionResponseDto> {
    const positionType = normalizeOpeningType(request.positionType)
    const requiredRole = positionType === OpeningPositionTypes.Inventory ? 'Storekeeper' : 'Finance Officer'
    await this.requireRoleAsync(actorUserId, actorRole, requiredRole)
    const projectId = InputNormalizer.positiveInt(request.projectId, 'ProjectId')
    await this.requireProjectAccessAsync(this.db, actorUserId, projectId)
    if (request.asOfDate === '0001-01-01' || request.asOfDate > businessToday()) {
      throw new ArgumentError('The opening-position date must be today or earlier.', 'AsOfDate')
    }
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)

    const [activeProject] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.status, 'Active')))
      .limit(1)
    if (!activeProject) throw new KeyNotFoundError('The active project was not found.')

    const batchId = await this.db.transaction(async (tx) => {
      const periodScope = positionType === OpeningPositionTypes.Inventory
        ? OperationalPeriodScopes.Inventory
        : OperationalPeriodScopes.Finance
      const [lockedPeriod] = await tx
        .select({ id: operationalPeriods.id })
        .from(operationalPeriods)
        .where(and(
          eq(operationalPeriods.projectId, projectId),
          eq(operationalPeriods.scope, periodScope),
          lte(operationalPeriods.startDate, request.asOfDate),
          gte(operationalPeriods.endDate, request.asOfDate),
          inArray(operationalPeriods.status, [OperationalPeriodStatuses.AwaitingClose, OperationalPeriodStatuses.Closed])))
        .limit(1)
      if (lockedPeriod) {
        throw new InvalidOperationError('An opening position cannot be added inside a period that is closing or closed.')
      }
      const now = new Date()

      let inventoryLines: { materialId: number; quantity: number; unitCost: number | null }[] = []
      let cashLines: { accountName: string; amount: number }[] = []
      if (positionType === OpeningPositionTypes.Inventory) {
        if (request.inventoryLines.length === 0) {
          throw new ArgumentError('At least one material is required.', 'InventoryLines')
        }
        if (request.cashLines.length !== 0) {
          throw new ArgumentError('Cash lines are not valid in an inventory opening position.', 'CashLines')
        }
        if (new Set(request.inventoryLines.map(item => item.materialId)).size !== request.inventoryLines.length) {
          throw new ArgumentError('Each material can appear only once in a batch.', 'InventoryLines')
        }

        const materialIds = request.inventoryLines.map(item => InputNormalizer.positiveInt(item.materialId, 'MaterialId'))
        const activeMaterialIds = await tx
          .select({ id: materials.id })
          .from(materials)
          .where(inArray(materials.id, materialIds))
        if (activeMaterialIds.length !== materialIds.length) {
          throw new KeyNotFoundError('One or more active materials were not found.')
        }
        if (await hasStockHistoryAsync(tx, projectId, materialIds)) {
          throw new InvalidOperationError('Opening stock can be submitted only before that project/material has stock history.')
        }
        const [existingLine] = await tx
          .select({ id: openingInventoryLines.id })
          .from(openingInventoryLines)
          .innerJoin(openingPositionBatches, eq(openingInventoryLines.openingPositionBatchId, openingPositionBatches.id))
          .where(and(
            eq(openingPositionBatches.projectId, projectId),
            inArray(openingInventoryLines.materialId, materialIds),
            ne(openingPositionBatches.status, OpeningPositionStatuses.Rejected)))
          .limit(1)
        if (existingLine) {
          throw new InvalidOperationError('An opening position already exists for one or more selected materials.')
        }

        inventoryLines = request.inventoryLines.map(item => ({
          materialId: item.materialId,
          quantity: InputNormalizer.positive(item.quantity, 'Quantity', 18, 3),
          unitCost: item.unitCost !== null ? InputNormalizer.nonNegative(item.unitCost, 'UnitCost', 18, 2) : null,
        }))
      } else {
        if (request.cashLines.length === 0) {
          throw new ArgumentError('At least one cash account is required.', 'CashLines')
        }
        if (request.inventoryLines.length !== 0) {
          throw new ArgumentError('Material lines are not valid in a cash opening position.', 'InventoryLines')
        }
        const normalizedNames = request.cashLines.map(item => InputNormalizer.requiredText(item.accountName, 'AccountName', 2, 100))
        if (new Set(normalizedNames.map(name => name.toUpperCase())).size !== normalizedNames.length) {
          throw new ArgumentError('Each cash account can appear only once in a batch.', 'CashLines')
        }
        const existingNames = (await tx
          .select({ name: sql<string>`lower(${cashAccounts.name})` })
          .from(cashAccounts)
          .where(eq(cashAccounts.projectId, projectId))).map(item => item.name)
        if (normalizedNames.some(name => existingNames.includes(name.toLowerCase()))) {
          throw new InvalidOperationError('An opening balance already exists for one or more selected cash accounts.')
        }
        const normalizedLowerNames = normalizedNames.map(name => name.toLowerCase())
        const [existingLine] = await tx
          .select({ id: openingCashLines.id })
          .from(openingCashLines)
          .innerJoin(openingPositionBatches, eq(openingCashLines.openingPositionBatchId, openingPositionBatches.id))
          .where(and(
            eq(openingPositionBatches.projectId, projectId),
            inArray(sql`lower(${openingCashLines.accountName})`, normalizedLowerNames),
            ne(openingPositionBatches.status, OpeningPositionStatuses.Rejected)))
          .limit(1)
        if (existingLine) {
          throw new InvalidOperationError('An opening position already exists for one or more selected cash accounts.')
        }

        cashLines = request.cashLines.map((item, index) => ({
          accountName: normalizedNames[index]!,
          amount: InputNormalizer.nonNegative(item.amount, 'Amount', 18, 2),
        }))
      }

      const [batch] = await tx
        .insert(openingPositionBatches)
        .values({
          batchNumber: reference(positionType === OpeningPositionTypes.Inventory ? 'OPI' : 'OPC', now),
          positionType,
          projectId,
          asOfDate: request.asOfDate,
          notes,
          evidenceReference: evidence,
          submittedByUserId: actorUserId,
          submittedAt: now,
          status: positionType === OpeningPositionTypes.Inventory
            ? OpeningPositionStatuses.AwaitingVerification
            : OpeningPositionStatuses.AwaitingApproval,
        })
        .returning()
      // Lines must exist before the submission event: the database seals them afterwards.
      if (inventoryLines.length > 0) {
        await tx.insert(openingInventoryLines).values(inventoryLines.map(line => ({ ...line, openingPositionBatchId: batch!.id })))
      }
      if (cashLines.length > 0) {
        await tx.insert(openingCashLines).values(cashLines.map(line => ({ ...line, openingPositionBatchId: batch!.id })))
      }
      await this.events.appendAsync({
        chainKey: `OPEN-${batch!.id}`,
        requisitionId: null,
        projectId,
        entityType: 'OpeningPosition',
        entityId: batch!.id,
        referenceNumber: batch!.batchNumber,
        eventType: 'OpeningPositionSubmitted',
        actorUserId,
        actorRole,
        details: {
          positionType,
          AsOfDate: request.asOfDate,
          lineCount: positionType === OpeningPositionTypes.Inventory ? request.inventoryLines.length : request.cashLines.length,
        },
        occurredAt: now,
      }, tx)
      return batch!.id
    }, Serializable)
    return await this.loadOpeningPositionAsync(batchId)
  }

  async verifyOpeningPositionAsync(
    id: number,
    request: OpeningPositionDecisionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OpeningPositionResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    if (id <= 0) throw new ArgumentError('Opening-position ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'OpeningPositionBatches', id)
      const batch = await findBatchAsync(tx, id)
      if (batch.positionType !== OpeningPositionTypes.Inventory
        || batch.status !== OpeningPositionStatuses.AwaitingVerification) {
        throw new InvalidOperationError('This opening-stock batch is not awaiting Supervisor verification.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, batch.projectId)
      if (batch.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The submitter cannot verify the opening stock.')
      }

      const now = new Date()
      await tx
        .update(openingPositionBatches)
        .set({ status: request.approve ? OpeningPositionStatuses.AwaitingApproval : OpeningPositionStatuses.Rejected })
        .where(eq(openingPositionBatches.id, batch.id))
      await tx.insert(openingPositionVerifications).values({
        openingPositionBatchId: batch.id,
        outcome: request.approve ? 'Verified' : 'Rejected',
        notes,
        verifiedByUserId: actorUserId,
        verifiedAt: now,
      })
      await this.events.appendAsync({
        chainKey: `OPEN-${batch.id}`,
        requisitionId: null,
        projectId: batch.projectId,
        entityType: 'OpeningPosition',
        entityId: batch.id,
        referenceNumber: batch.batchNumber,
        eventType: request.approve ? 'OpeningStockVerified' : 'OpeningStockRejected',
        actorUserId,
        actorRole,
        details: { notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadOpeningPositionAsync(id)
  }

  async decideOpeningPositionAsync(
    id: number,
    request: OpeningPositionDecisionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OpeningPositionResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'CEO')
    if (id <= 0) throw new ArgumentError('Opening-position ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'OpeningPositionBatches', id)
      const batch = await findBatchAsync(tx, id)
      if (batch.status !== OpeningPositionStatuses.AwaitingApproval) {
        throw new InvalidOperationError('This opening position already has a decision.')
      }
      if (batch.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The submitter cannot approve the opening position.')
      }
      if (batch.positionType === OpeningPositionTypes.Inventory) {
        const [verification] = await tx
          .select({ verifiedByUserId: openingPositionVerifications.verifiedByUserId })
          .from(openingPositionVerifications)
          .where(eq(openingPositionVerifications.openingPositionBatchId, batch.id))
          .limit(1)
        if (verification?.verifiedByUserId === actorUserId) {
          throw new UnauthorizedAccessError('The opening-stock verifier cannot approve the same opening position.')
        }
      }

      const now = new Date()
      const outcome = request.approve ? OpeningPositionStatuses.Approved : OpeningPositionStatuses.Rejected
      await tx.update(openingPositionBatches).set({ status: outcome }).where(eq(openingPositionBatches.id, batch.id))
      await tx.insert(openingPositionDecisions).values({
        openingPositionBatchId: batch.id,
        outcome,
        notes,
        decidedByUserId: actorUserId,
        decidedAt: now,
      })

      if (request.approve) {
        if (batch.positionType === OpeningPositionTypes.Inventory) {
          const lines = await tx
            .select()
            .from(openingInventoryLines)
            .where(eq(openingInventoryLines.openingPositionBatchId, batch.id))
            .orderBy(asc(openingInventoryLines.id))
          const materialIds = lines.map(item => item.materialId)
          if (await hasStockHistoryAsync(tx, batch.projectId, materialIds)) {
            throw new InvalidOperationError(
              'Stock history was added after submission. Reject this batch and reconcile it separately.')
          }
          for (const line of lines) {
            await tx.insert(stockBalances).values({
              projectId: batch.projectId,
              materialId: line.materialId,
              quantityOnHand: line.quantity,
              updatedAt: now,
            })
            await tx.insert(stockLedgerEntries).values({
              projectId: batch.projectId,
              materialId: line.materialId,
              movementType: 'OpeningBalance',
              quantityDelta: line.quantity,
              balanceAfter: line.quantity,
              referenceType: 'OpeningPosition',
              referenceId: batch.id,
              referenceNumber: batch.batchNumber,
              actorUserId,
              notes,
              occurredAt: now,
            })
          }
        } else {
          const lines = await tx
            .select()
            .from(openingCashLines)
            .where(eq(openingCashLines.openingPositionBatchId, batch.id))
            .orderBy(asc(openingCashLines.id))
          for (const line of lines) {
            const [existing] = await tx
              .select({ id: cashAccounts.id })
              .from(cashAccounts)
              .where(and(
                eq(cashAccounts.projectId, batch.projectId),
                sql`lower(${cashAccounts.name}) = lower(${line.accountName})`))
              .limit(1)
            if (existing) throw new InvalidOperationError(`Cash account '${line.accountName}' was added after submission.`)
            const [account] = await tx
              .insert(cashAccounts)
              .values({ projectId: batch.projectId, name: line.accountName, balance: line.amount, updatedAt: now })
              .returning({ id: cashAccounts.id })
            await tx.insert(cashLedgerEntries).values({
              entryNumber: reference('CASH', now),
              cashAccountId: account!.id,
              projectId: batch.projectId,
              amountDelta: line.amount,
              balanceAfter: line.amount,
              entryType: 'OpeningBalance',
              referenceType: 'OpeningPosition',
              referenceId: batch.id,
              referenceNumber: batch.batchNumber,
              postedByUserId: actorUserId,
              postedAt: now,
              notes,
            })
          }
        }
        await tx.insert(openingPositionPostings).values({
          openingPositionBatchId: batch.id,
          postedByUserId: actorUserId,
          postedAt: now,
        })
      }

      await this.events.appendAsync({
        chainKey: `OPEN-${batch.id}`,
        requisitionId: null,
        projectId: batch.projectId,
        entityType: 'OpeningPosition',
        entityId: batch.id,
        referenceNumber: batch.batchNumber,
        eventType: request.approve ? 'OpeningPositionApproved' : 'OpeningPositionRejected',
        actorUserId,
        actorRole,
        details: { PositionType: batch.positionType, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadOpeningPositionAsync(id)
  }

  async getMaterialReturnsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<MaterialReturnResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Foreman', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      actorRole === 'Foreman' && !await this.canVerifyAllProjectsAsync(actorUserId)
        ? eq(materialReturns.returnedByUserId, actorUserId)
        : await this.scopeByProjectAsync(actorUserId, actorRole, materialIssues.projectId),
      projectId !== null ? eq(materialIssues.projectId, projectId) : undefined)
    return await loadMaterialReturnsAsync(this.db, filter, { orderBy: [desc(materialReturns.returnedAt)], limit: 250 })
  }

  async resolveMaterialIssueDisputeAsync(
    materialIssueId: number,
    request: ResolveMaterialIssueDisputeRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialIssueDisputeResolutionResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    if (materialIssueId <= 0) throw new ArgumentError('Material issue ID must be positive.', 'materialIssueId')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const resolutionId = await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'MaterialIssues', materialIssueId)
      const issue = singleOrDefault(await tx.select().from(materialIssues).where(eq(materialIssues.id, materialIssueId)).limit(2))
      if (issue === null) throw new KeyNotFoundError('The material issue was not found.')
      if (issue.status !== MaterialIssueStatuses.Disputed || issue.confirmedQuantity === null) {
        throw new InvalidOperationError('This material handover is not awaiting dispute resolution.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, issue.projectId)
      if (actorUserId === issue.issuedByUserId || actorUserId === issue.confirmedByUserId) {
        throw new UnauthorizedAccessError('The issuer and recipient cannot resolve their own quantity dispute.')
      }
      const [existing] = await tx
        .select({ id: materialIssueDisputeResolutions.id })
        .from(materialIssueDisputeResolutions)
        .where(eq(materialIssueDisputeResolutions.materialIssueId, issue.id))
        .limit(1)
      if (existing) throw new InvalidOperationError('This handover dispute already has a resolution.')

      const returnedToStore = dec(issue.quantityIssued).minus(issue.confirmedQuantity)
      if (returnedToStore.lte(0)) {
        throw new InvalidOperationError('The disputed quantity is not lower than the issued quantity.')
      }
      const balance = await getBalanceAsync(tx, issue.projectId, issue.materialId)
      if (balance === null) throw new InvalidOperationError('The project store balance was not found.')
      const now = new Date()
      const [resolution] = await tx
        .insert(materialIssueDisputeResolutions)
        .values({
          resolutionNumber: reference('MDR', now),
          materialIssueId: issue.id,
          issuedQuantity: issue.quantityIssued,
          foremanReceivedQuantity: issue.confirmedQuantity,
          returnedToStoreQuantity: toNumber(returnedToStore),
          notes,
          evidenceReference: evidence,
          resolvedByUserId: actorUserId,
          resolvedAt: now,
        })
        .returning()
      const after = dec(balance.quantityOnHand).plus(returnedToStore)
      await tx
        .update(stockBalances)
        .set({ quantityOnHand: toNumber(after), updatedAt: now })
        .where(eq(stockBalances.id, balance.id))
      await tx.insert(stockLedgerEntries).values({
        projectId: issue.projectId,
        materialId: issue.materialId,
        movementType: 'HandoverCorrection',
        quantityDelta: toNumber(returnedToStore),
        balanceAfter: toNumber(after),
        referenceType: 'MaterialIssueDisputeResolution',
        referenceId: resolution!.id,
        referenceNumber: resolution!.resolutionNumber,
        actorUserId,
        notes,
        occurredAt: now,
      })
      await tx.update(materialIssues).set({ status: MaterialIssueStatuses.Confirmed }).where(eq(materialIssues.id, issue.id))
      await this.events.appendAsync({
        chainKey: `REQ-${issue.requisitionId}`,
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialIssueDisputeResolution',
        entityId: resolution!.id,
        referenceNumber: resolution!.resolutionNumber,
        eventType: 'MaterialHandoverDisputeResolved',
        actorUserId,
        actorRole,
        details: {
          issuedQuantity: issue.quantityIssued,
          foremanReceivedQuantity: issue.confirmedQuantity,
          returnedToStoreQuantity: toNumber(returnedToStore),
          notes,
        },
        occurredAt: now,
      }, tx)
      return resolution!.id
    }, Serializable)
    return await this.loadDisputeResolutionAsync(resolutionId)
  }

  async createMaterialReturnAsync(
    request: CreateMaterialReturnRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialReturnResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Foreman')
    if (request.materialIssueId <= 0) throw new ArgumentError('Material issue ID must be positive.', 'MaterialIssueId')
    const quantity = InputNormalizer.positive(request.quantity, 'Quantity', 18, 3)
    const condition = InputNormalizer.requiredText(request.condition, 'Condition', 2, 30)
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const returnId = await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'MaterialIssues', request.materialIssueId)
      const issue = singleOrDefault(await tx
        .select()
        .from(materialIssues)
        .where(eq(materialIssues.id, request.materialIssueId))
        .limit(2))
      if (issue === null) throw new KeyNotFoundError('The material issue was not found.')
      if (issue.issuedToUserId !== actorUserId) {
        throw new UnauthorizedAccessError('Only the recorded recipient can return this material.')
      }
      if (issue.status !== MaterialIssueStatuses.Confirmed) {
        throw new InvalidOperationError('Only a confirmed handover can be returned to Stores.')
      }
      if (await hasActiveCloseoutAsync(tx, issue.id)) {
        throw new InvalidOperationError('This issue has an active or approved custody close-out.')
      }
      const used = await sumUsageAsync(tx, issue.id, null)
      const acceptedReturns = await sumReturnsAsync(tx, issue.id, MaterialReturnStatuses.Received)
      const pendingReturns = await sumReturnsAsync(tx, issue.id, MaterialReturnStatuses.AwaitingReceipt)
      const available = dec(issue.confirmedQuantity ?? 0).minus(used).minus(acceptedReturns).minus(pendingReturns)
      if (dec(quantity).gt(available)) {
        throw new InvalidOperationError('The return quantity exceeds the material still in this Foreman\'s custody.')
      }

      const now = new Date()
      const [materialReturn] = await tx
        .insert(materialReturns)
        .values({
          returnNumber: reference('MRT', now),
          materialIssueId: issue.id,
          quantityOffered: quantity,
          condition,
          notes,
          evidenceReference: evidence,
          returnedByUserId: actorUserId,
          returnedAt: now,
          status: MaterialReturnStatuses.AwaitingReceipt,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `REQ-${issue.requisitionId}`,
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialReturn',
        entityId: materialReturn!.id,
        referenceNumber: materialReturn!.returnNumber,
        eventType: 'MaterialReturnSubmitted',
        actorUserId,
        actorRole,
        details: { quantity, condition },
        occurredAt: now,
      }, tx)
      return materialReturn!.id
    }, Serializable)
    return await this.loadMaterialReturnAsync(returnId)
  }

  async receiveMaterialReturnAsync(
    id: number,
    request: ReceiveMaterialReturnRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<MaterialReturnResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Storekeeper')
    if (id <= 0) throw new ArgumentError('Material return ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const accepted = request.accept ? InputNormalizer.positive(request.quantityAccepted, 'QuantityAccepted', 18, 3) : 0
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'MaterialReturns', id)
      const row = singleOrDefault(await tx
        .select({ materialReturn: materialReturns, issue: materialIssues })
        .from(materialReturns)
        .innerJoin(materialIssues, eq(materialReturns.materialIssueId, materialIssues.id))
        .where(eq(materialReturns.id, id))
        .limit(2))
      if (row === null) throw new KeyNotFoundError('The material return was not found.')
      const { materialReturn, issue } = row
      if (materialReturn.status !== MaterialReturnStatuses.AwaitingReceipt) {
        throw new InvalidOperationError('This return already has a Stores decision.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, issue.projectId)
      if (materialReturn.returnedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The person returning material cannot receive it into Stores.')
      }
      if (request.accept && !dec(accepted).eq(materialReturn.quantityOffered)) {
        throw new ArgumentError(
          'The accepted quantity must equal the offered quantity. Reject and ask the Foreman to submit the actual quantity.',
          'QuantityAccepted')
      }
      const now = new Date()
      await tx
        .update(materialReturns)
        .set({
          status: request.accept ? MaterialReturnStatuses.Received : MaterialReturnStatuses.Rejected,
          quantityAccepted: accepted,
          receivedByUserId: actorUserId,
          receiptNotes: notes,
          receiptEvidenceReference: evidence,
          receivedAt: now,
        })
        .where(eq(materialReturns.id, materialReturn.id))
      if (request.accept) {
        const balance = await getBalanceAsync(tx, issue.projectId, issue.materialId)
        if (balance === null) throw new InvalidOperationError('The project store balance was not found.')
        const after = dec(balance.quantityOnHand).plus(accepted)
        await tx
          .update(stockBalances)
          .set({ quantityOnHand: toNumber(after), updatedAt: now })
          .where(eq(stockBalances.id, balance.id))
        await tx.insert(stockLedgerEntries).values({
          projectId: balance.projectId,
          materialId: balance.materialId,
          movementType: 'ReturnToStore',
          quantityDelta: accepted,
          balanceAfter: toNumber(after),
          referenceType: 'MaterialReturn',
          referenceId: materialReturn.id,
          referenceNumber: materialReturn.returnNumber,
          actorUserId,
          notes,
          occurredAt: now,
        })
      }
      await this.events.appendAsync({
        chainKey: `REQ-${issue.requisitionId}`,
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialReturn',
        entityId: materialReturn.id,
        referenceNumber: materialReturn.returnNumber,
        eventType: request.accept ? 'MaterialReturnReceived' : 'MaterialReturnRejected',
        actorUserId,
        actorRole,
        details: { quantityOffered: materialReturn.quantityOffered, quantityAccepted: accepted, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadMaterialReturnAsync(id)
  }

  async getCustodyCloseoutsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<CustodyCloseoutResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Foreman', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      actorRole === 'Foreman' && !await this.canVerifyAllProjectsAsync(actorUserId)
        ? eq(materialCustodyCloseouts.submittedByUserId, actorUserId)
        : await this.scopeByProjectAsync(actorUserId, actorRole, materialIssues.projectId),
      projectId !== null ? eq(materialIssues.projectId, projectId) : undefined)
    return await loadCustodyCloseoutsAsync(this.db, filter, { orderBy: [desc(materialCustodyCloseouts.submittedAt)], limit: 250 })
  }

  async submitCustodyCloseoutAsync(
    request: SubmitCustodyCloseoutRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<CustodyCloseoutResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Foreman')
    if (request.materialIssueId <= 0) throw new ArgumentError('Material issue ID must be positive.', 'MaterialIssueId')
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    const closeoutId = await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'MaterialIssues', request.materialIssueId)
      const issue = singleOrDefault(await tx
        .select()
        .from(materialIssues)
        .where(eq(materialIssues.id, request.materialIssueId))
        .limit(2))
      if (issue === null) throw new KeyNotFoundError('The material issue was not found.')
      if (issue.issuedToUserId !== actorUserId) {
        throw new UnauthorizedAccessError('Only the recorded recipient can close this custody record.')
      }
      if (issue.status !== MaterialIssueStatuses.Confirmed) {
        throw new InvalidOperationError('The material handover must be confirmed before close-out.')
      }
      const [pendingReturn] = await tx
        .select({ id: materialReturns.id })
        .from(materialReturns)
        .where(and(eq(materialReturns.materialIssueId, issue.id), eq(materialReturns.status, MaterialReturnStatuses.AwaitingReceipt)))
        .limit(1)
      if (pendingReturn) {
        throw new InvalidOperationError('Wait for Stores to receive or reject the pending material return.')
      }
      if (await hasActiveCloseoutAsync(tx, issue.id)) {
        throw new InvalidOperationError('This issue already has an active or approved close-out.')
      }
      const used = await sumUsageAsync(tx, issue.id, 'Used')
      const wasted = await sumUsageAsync(tx, issue.id, 'Wastage')
      const returned = await sumReturnsAsync(tx, issue.id, MaterialReturnStatuses.Received)
      const confirmed = dec(issue.confirmedQuantity ?? 0)
      const unaccounted = confirmed.minus(used).minus(wasted).minus(returned)
      if (!unaccounted.eq(0)) {
        throw new InvalidOperationError(
          `${formatUpToThreeDecimals(unaccounted)} remains in site custody. Record its use, wastage, or return before close-out.`)
      }
      const [{ value: maxRevision } = { value: null }] = await tx
        .select({ value: max(materialCustodyCloseouts.revision) })
        .from(materialCustodyCloseouts)
        .where(eq(materialCustodyCloseouts.materialIssueId, issue.id))
      const revision = (maxRevision ?? 0) + 1
      const now = new Date()
      const [closeout] = await tx
        .insert(materialCustodyCloseouts)
        .values({
          closeoutNumber: reference('MCO', now),
          materialIssueId: issue.id,
          revision,
          confirmedQuantity: toNumber(confirmed),
          usedQuantity: toNumber(used),
          wastedQuantity: toNumber(wasted),
          returnedQuantity: toNumber(returned),
          unaccountedQuantity: toNumber(unaccounted),
          notes,
          evidenceReference: evidence,
          submittedByUserId: actorUserId,
          submittedAt: now,
          status: CustodyCloseoutStatuses.AwaitingReview,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `REQ-${issue.requisitionId}`,
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialCustodyCloseout',
        entityId: closeout!.id,
        referenceNumber: closeout!.closeoutNumber,
        eventType: 'CustodyCloseoutSubmitted',
        actorUserId,
        actorRole,
        details: {
          confirmed: toNumber(confirmed),
          used: toNumber(used),
          wasted: toNumber(wasted),
          returned: toNumber(returned),
          unaccounted: toNumber(unaccounted),
          revision,
        },
        occurredAt: now,
      }, tx)
      return closeout!.id
    }, Serializable)
    return await this.loadCustodyCloseoutAsync(closeoutId)
  }

  async reviewCustodyCloseoutAsync(
    id: number,
    request: ReviewCustodyCloseoutRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<CustodyCloseoutResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'Supervisor')
    if (id <= 0) throw new ArgumentError('Custody close-out ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'MaterialCustodyCloseouts', id)
      const row = singleOrDefault(await tx
        .select({ closeout: materialCustodyCloseouts, issue: materialIssues })
        .from(materialCustodyCloseouts)
        .innerJoin(materialIssues, eq(materialCustodyCloseouts.materialIssueId, materialIssues.id))
        .where(eq(materialCustodyCloseouts.id, id))
        .limit(2))
      if (row === null) throw new KeyNotFoundError('The custody close-out was not found.')
      const { closeout, issue } = row
      if (closeout.status !== CustodyCloseoutStatuses.AwaitingReview) {
        throw new InvalidOperationError('This close-out already has a decision.')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, issue.projectId)
      if (closeout.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The submitter cannot review the custody close-out.')
      }
      if (request.approve && !dec(closeout.unaccountedQuantity).eq(0)) {
        throw new InvalidOperationError('A close-out with unexplained material cannot be approved.')
      }
      const now = new Date()
      const outcome = request.approve ? CustodyCloseoutStatuses.Approved : CustodyCloseoutStatuses.Returned
      await tx.update(materialCustodyCloseouts).set({ status: outcome }).where(eq(materialCustodyCloseouts.id, closeout.id))
      await tx.insert(materialCustodyCloseoutDecisions).values({
        materialCustodyCloseoutId: closeout.id,
        outcome,
        notes,
        decidedByUserId: actorUserId,
        decidedAt: now,
      })
      await this.events.appendAsync({
        chainKey: `REQ-${issue.requisitionId}`,
        requisitionId: issue.requisitionId,
        projectId: issue.projectId,
        entityType: 'MaterialCustodyCloseout',
        entityId: closeout.id,
        referenceNumber: closeout.closeoutNumber,
        eventType: request.approve ? 'CustodyCloseoutApproved' : 'CustodyCloseoutReturned',
        actorUserId,
        actorRole,
        details: { Revision: closeout.revision, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadCustodyCloseoutAsync(id)
  }

  async getPeriodsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<OperationalPeriodResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      await this.scopeByProjectAsync(actorUserId, actorRole, operationalPeriods.projectId),
      actorRole === 'Storekeeper' || actorRole === 'Supervisor'
        ? eq(operationalPeriods.scope, OperationalPeriodScopes.Inventory)
        : actorRole === 'Finance Officer'
          ? eq(operationalPeriods.scope, OperationalPeriodScopes.Finance)
          : undefined,
      projectId !== null ? eq(operationalPeriods.projectId, projectId) : undefined)
    return await loadPeriodsAsync(this.db, filter, {
      orderBy: [desc(operationalPeriods.endDate), desc(operationalPeriods.id)],
      limit: 250,
    })
  }

  async createPeriodAsync(
    request: CreateOperationalPeriodRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OperationalPeriodResponseDto> {
    const scope = normalizePeriodScope(request.scope)
    const requiredRole = scope === OperationalPeriodScopes.Inventory ? 'Supervisor' : 'Finance Officer'
    await this.requireRoleAsync(actorUserId, actorRole, requiredRole)
    const projectId = InputNormalizer.positiveInt(request.projectId, 'ProjectId')
    await this.requireProjectAccessAsync(this.db, actorUserId, projectId)
    const name = InputNormalizer.requiredText(request.name, 'Name', 2, 100)
    if (request.startDate === '0001-01-01' || request.endDate === '0001-01-01' || request.startDate > request.endDate) {
      throw new ArgumentError('The period start date must be on or before its end date.')
    }
    const [activeProject] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.status, 'Active')))
      .limit(1)
    if (!activeProject) throw new KeyNotFoundError('The active project was not found.')
    const periodId = await this.db.transaction(async (tx) => {
      const [overlap] = await tx
        .select({ id: operationalPeriods.id })
        .from(operationalPeriods)
        .where(and(
          eq(operationalPeriods.projectId, projectId),
          eq(operationalPeriods.scope, scope),
          lte(operationalPeriods.startDate, request.endDate),
          gte(operationalPeriods.endDate, request.startDate)))
        .limit(1)
      if (overlap) {
        throw new InvalidOperationError('This date range overlaps another period for the same project and scope.')
      }
      const now = new Date()
      const [period] = await tx
        .insert(operationalPeriods)
        .values({
          periodNumber: reference(scope === OperationalPeriodScopes.Inventory ? 'PER-I' : 'PER-F', now),
          projectId,
          scope,
          name,
          startDate: request.startDate,
          endDate: request.endDate,
          status: OperationalPeriodStatuses.Open,
          createdByUserId: actorUserId,
          createdAt: now,
        })
        .returning()
      await tx.insert(operationalPeriodEvents).values({
        operationalPeriodId: period!.id,
        sequenceNumber: 1,
        eventType: 'Opened',
        notes: name,
        actorUserId,
        actorRole,
        occurredAt: now,
      })
      await this.events.appendAsync({
        chainKey: `PERIOD-${period!.id}`,
        requisitionId: null,
        projectId: period!.projectId,
        entityType: 'OperationalPeriod',
        entityId: period!.id,
        referenceNumber: period!.periodNumber,
        eventType: 'PeriodOpened',
        actorUserId,
        actorRole,
        details: { scope, StartDate: request.startDate, EndDate: request.endDate },
        occurredAt: now,
      }, tx)
      return period!.id
    }, Serializable)
    return await this.loadPeriodAsync(periodId)
  }

  async submitPeriodCloseAsync(
    id: number,
    request: PeriodActionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OperationalPeriodResponseDto> {
    if (id <= 0) throw new ArgumentError('Period ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'OperationalPeriods', id)
      const period = await findPeriodAsync(tx, id)
      const requiredRole = period.scope === OperationalPeriodScopes.Inventory ? 'Supervisor' : 'Finance Officer'
      await this.requireRoleAsync(actorUserId, actorRole, requiredRole)
      await this.requireProjectAccessAsync(tx, actorUserId, period.projectId)
      if (period.status !== OperationalPeriodStatuses.Open && period.status !== OperationalPeriodStatuses.Returned) {
        throw new InvalidOperationError('Only an open or returned period can be submitted for closing.')
      }
      if (period.endDate >= businessToday()) {
        throw new InvalidOperationError('A period can be submitted for closing only after its end date has passed.')
      }
      const blockers = await getPeriodBlockersAsync(tx, period)
      if (blockers.length !== 0) {
        throw new InvalidOperationError(`Resolve before closing: ${blockers.join('; ')}`)
      }
      const now = new Date()
      await tx
        .update(operationalPeriods)
        .set({ status: OperationalPeriodStatuses.AwaitingClose })
        .where(eq(operationalPeriods.id, period.id))
      const [{ value: maxSequence } = { value: null }] = await tx
        .select({ value: max(operationalPeriodEvents.sequenceNumber) })
        .from(operationalPeriodEvents)
        .where(eq(operationalPeriodEvents.operationalPeriodId, id))
      await tx.insert(operationalPeriodEvents).values({
        operationalPeriodId: period.id,
        sequenceNumber: (maxSequence ?? 0) + 1,
        eventType: 'CloseSubmitted',
        notes,
        actorUserId,
        actorRole,
        occurredAt: now,
      })
      await this.events.appendAsync({
        chainKey: `PERIOD-${period.id}`,
        requisitionId: null,
        projectId: period.projectId,
        entityType: 'OperationalPeriod',
        entityId: period.id,
        referenceNumber: period.periodNumber,
        eventType: 'PeriodCloseSubmitted',
        actorUserId,
        actorRole,
        details: { Scope: period.scope, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadPeriodAsync(id)
  }

  async decidePeriodCloseAsync(
    id: number,
    request: PeriodDecisionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<OperationalPeriodResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'CEO')
    if (id <= 0) throw new ArgumentError('Period ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'OperationalPeriods', id)
      const period = await findPeriodAsync(tx, id)
      const events = await tx
        .select({
          eventType: operationalPeriodEvents.eventType,
          actorUserId: operationalPeriodEvents.actorUserId,
          sequenceNumber: operationalPeriodEvents.sequenceNumber,
        })
        .from(operationalPeriodEvents)
        .where(eq(operationalPeriodEvents.operationalPeriodId, id))
      if (period.status !== OperationalPeriodStatuses.AwaitingClose) {
        throw new InvalidOperationError('This period is not awaiting a close decision.')
      }
      if (events.some(item => item.eventType === 'CloseSubmitted' && item.actorUserId === actorUserId)) {
        throw new UnauthorizedAccessError('The person submitting a period cannot approve its close.')
      }
      if (request.approve) {
        const blockers = await getPeriodBlockersAsync(tx, period)
        if (blockers.length !== 0) {
          throw new InvalidOperationError(`New unresolved records were found: ${blockers.join('; ')}`)
        }
      }
      const now = new Date()
      await tx
        .update(operationalPeriods)
        .set({ status: request.approve ? OperationalPeriodStatuses.Closed : OperationalPeriodStatuses.Returned })
        .where(eq(operationalPeriods.id, period.id))
      const sequence = Math.max(0, ...events.map(item => item.sequenceNumber)) + 1
      await tx.insert(operationalPeriodEvents).values({
        operationalPeriodId: period.id,
        sequenceNumber: sequence,
        eventType: request.approve ? 'Closed' : 'CloseReturned',
        notes,
        actorUserId,
        actorRole,
        occurredAt: now,
      })
      await this.events.appendAsync({
        chainKey: `PERIOD-${period.id}`,
        requisitionId: null,
        projectId: period.projectId,
        entityType: 'OperationalPeriod',
        entityId: period.id,
        referenceNumber: period.periodNumber,
        eventType: request.approve ? 'PeriodClosed' : 'PeriodCloseReturned',
        actorUserId,
        actorRole,
        details: { Scope: period.scope, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadPeriodAsync(id)
  }

  async getCorrectionsAsync(
    actorUserId: number,
    actorRole: string,
    projectId: number | null = null,
  ): Promise<ControlledCorrectionResponseDto[]> {
    await this.requireAnyRoleAsync(actorUserId, actorRole, 'Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
    validateOptionalProjectId(projectId)
    const filter = and(
      await this.scopeByProjectAsync(actorUserId, actorRole, controlledCorrections.projectId),
      actorRole === 'Storekeeper' || actorRole === 'Supervisor'
        ? eq(controlledCorrections.correctionType, ControlledCorrectionTypes.Inventory)
        : actorRole === 'Finance Officer'
          ? eq(controlledCorrections.correctionType, ControlledCorrectionTypes.Finance)
          : undefined,
      projectId !== null ? eq(controlledCorrections.projectId, projectId) : undefined)
    return await loadCorrectionsAsync(this.db, filter, { orderBy: [desc(controlledCorrections.submittedAt)], limit: 250 })
  }

  async createCorrectionAsync(
    request: CreateControlledCorrectionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<ControlledCorrectionResponseDto> {
    if (request.operationalPeriodId <= 0) throw new ArgumentError('Period ID must be positive.', 'OperationalPeriodId')
    const correctionType = normalizePeriodScope(request.correctionType)
    const requiredRole = correctionType === ControlledCorrectionTypes.Inventory ? 'Storekeeper' : 'Finance Officer'
    await this.requireRoleAsync(actorUserId, actorRole, requiredRole)
    const reason = InputNormalizer.requiredText(request.reason, 'Reason', 3, 1_000)
    const evidence = InputNormalizer.optionalText(request.evidenceReference, 'EvidenceReference', 500)
    ensureSignedPrecision(request.quantityDelta, 'QuantityDelta', 18, 3)
    ensureSignedPrecision(request.amountDelta, 'AmountDelta', 18, 2)
    const correctionId = await this.db.transaction(async (tx) => {
      const period = singleOrDefault(await tx
        .select()
        .from(operationalPeriods)
        .where(eq(operationalPeriods.id, request.operationalPeriodId))
        .limit(2))
      if (period === null) throw new KeyNotFoundError('The closed period was not found.')
      if (period.status !== OperationalPeriodStatuses.Closed) {
        throw new InvalidOperationError('Corrections can be raised only against a closed period.')
      }
      if (period.scope !== correctionType) {
        throw new ArgumentError('The correction type must match the period scope.', 'CorrectionType')
      }
      await this.requireProjectAccessAsync(tx, actorUserId, period.projectId)

      let materialId: number | null = null
      let accountName: string | null = null
      if (correctionType === ControlledCorrectionTypes.Inventory) {
        if (request.materialId === null || request.materialId <= 0
          || dec(request.quantityDelta).eq(0) || !dec(request.amountDelta).eq(0)) {
          throw new ArgumentError('Inventory corrections require one material and a non-zero quantity only.')
        }
        materialId = request.materialId
        const [material] = await tx.select({ id: materials.id }).from(materials).where(eq(materials.id, materialId)).limit(1)
        if (!material) throw new KeyNotFoundError('The active material was not found.')
      } else {
        if (dec(request.amountDelta).eq(0) || !dec(request.quantityDelta).eq(0)) {
          throw new ArgumentError('Finance corrections require a non-zero amount only.')
        }
        accountName = InputNormalizer.requiredText(request.cashAccountName, 'CashAccountName', 2, 100)
        const [account] = await tx
          .select({ id: cashAccounts.id })
          .from(cashAccounts)
          .where(and(
            eq(cashAccounts.projectId, period.projectId),
            sql`lower(${cashAccounts.name}) = lower(${accountName})`))
          .limit(1)
        if (!account) throw new KeyNotFoundError('The project cash account was not found.')
      }

      const now = new Date()
      const [correction] = await tx
        .insert(controlledCorrections)
        .values({
          correctionNumber: reference(correctionType === ControlledCorrectionTypes.Inventory ? 'COR-I' : 'COR-F', now),
          operationalPeriodId: period.id,
          projectId: period.projectId,
          correctionType,
          materialId,
          cashAccountName: accountName,
          quantityDelta: request.quantityDelta,
          amountDelta: request.amountDelta,
          reason,
          evidenceReference: evidence,
          status: ControlledCorrectionStatuses.AwaitingApproval,
          submittedByUserId: actorUserId,
          submittedAt: now,
        })
        .returning()
      await this.events.appendAsync({
        chainKey: `CORRECTION-${correction!.id}`,
        requisitionId: null,
        projectId: correction!.projectId,
        entityType: 'ControlledCorrection',
        entityId: correction!.id,
        referenceNumber: correction!.correctionNumber,
        eventType: 'CorrectionSubmitted',
        actorUserId,
        actorRole,
        details: {
          correctionType,
          QuantityDelta: correction!.quantityDelta,
          AmountDelta: correction!.amountDelta,
          reason,
        },
        occurredAt: now,
      }, tx)
      return correction!.id
    }, Serializable)
    return await this.loadCorrectionAsync(correctionId)
  }

  async decideCorrectionAsync(
    id: number,
    request: CorrectionDecisionRequestDto,
    actorUserId: number,
    actorRole: string,
  ): Promise<ControlledCorrectionResponseDto> {
    await this.requireRoleAsync(actorUserId, actorRole, 'CEO')
    if (id <= 0) throw new ArgumentError('Correction ID must be positive.', 'id')
    const notes = InputNormalizer.requiredText(request.notes, 'Notes', 3, 1_000)
    await this.db.transaction(async (tx) => {
      await lockRowAsync(tx, 'ControlledCorrections', id)
      const correction = singleOrDefault(await tx
        .select()
        .from(controlledCorrections)
        .where(eq(controlledCorrections.id, id))
        .limit(2))
      if (correction === null) throw new KeyNotFoundError('The correction was not found.')
      if (correction.status !== ControlledCorrectionStatuses.AwaitingApproval) {
        throw new InvalidOperationError('This correction already has a decision.')
      }
      if (correction.submittedByUserId === actorUserId) {
        throw new UnauthorizedAccessError('The submitter cannot approve the correction.')
      }
      const now = new Date()
      const outcome = request.approve ? ControlledCorrectionStatuses.Approved : ControlledCorrectionStatuses.Rejected
      await tx.update(controlledCorrections).set({ status: outcome }).where(eq(controlledCorrections.id, correction.id))
      await tx.insert(controlledCorrectionDecisions).values({
        controlledCorrectionId: correction.id,
        outcome,
        notes,
        decidedByUserId: actorUserId,
        decidedAt: now,
      })
      if (request.approve && correction.correctionType === ControlledCorrectionTypes.Inventory) {
        const balance = correction.materialId === null
          ? null
          : await getBalanceAsync(tx, correction.projectId, correction.materialId)
        if (balance === null) throw new InvalidOperationError('The project store balance was not found.')
        const after = dec(balance.quantityOnHand).plus(correction.quantityDelta)
        if (after.lt(0)) throw new InvalidOperationError('The approved correction would make the store balance negative.')
        await tx
          .update(stockBalances)
          .set({ quantityOnHand: toNumber(after), updatedAt: now })
          .where(eq(stockBalances.id, balance.id))
        await tx.insert(stockLedgerEntries).values({
          projectId: correction.projectId,
          materialId: correction.materialId!,
          movementType: 'ControlledCorrection',
          quantityDelta: correction.quantityDelta,
          balanceAfter: toNumber(after),
          referenceType: 'ControlledCorrection',
          referenceId: correction.id,
          referenceNumber: correction.correctionNumber,
          actorUserId,
          notes: `${correction.reason}. ${notes}`,
          occurredAt: now,
        })
      } else if (request.approve) {
        const accountName = correction.cashAccountName!
        const accounts = await tx
          .select()
          .from(cashAccounts)
          .where(and(
            eq(cashAccounts.projectId, correction.projectId),
            sql`lower(${cashAccounts.name}) = lower(${accountName})`))
          .limit(2)
        if (accounts.length !== 1) {
          throw new InvalidOperationError(accounts.length === 0
            ? 'Sequence contains no elements'
            : 'Sequence contains more than one element')
        }
        const account = accounts[0]!
        const balance = dec(account.balance).plus(correction.amountDelta)
        if (balance.lt(0)) {
          throw new InvalidOperationError('The approved correction would make the cash-account balance negative.')
        }
        await tx
          .update(cashAccounts)
          .set({ balance: toNumber(balance), updatedAt: now })
          .where(eq(cashAccounts.id, account.id))
        await tx.insert(cashLedgerEntries).values({
          entryNumber: reference('CASH', now),
          cashAccountId: account.id,
          projectId: correction.projectId,
          amountDelta: correction.amountDelta,
          balanceAfter: toNumber(balance),
          entryType: 'ControlledCorrection',
          referenceType: 'ControlledCorrection',
          referenceId: correction.id,
          referenceNumber: correction.correctionNumber,
          postedByUserId: actorUserId,
          postedAt: now,
          notes: `${correction.reason}. ${notes}`,
        })
      }
      await this.events.appendAsync({
        chainKey: `CORRECTION-${correction.id}`,
        requisitionId: null,
        projectId: correction.projectId,
        entityType: 'ControlledCorrection',
        entityId: correction.id,
        referenceNumber: correction.correctionNumber,
        eventType: request.approve ? 'CorrectionApproved' : 'CorrectionRejected',
        actorUserId,
        actorRole,
        details: { CorrectionType: correction.correctionType, notes },
        occurredAt: now,
      }, tx)
    }, Serializable)
    return await this.loadCorrectionAsync(id)
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

  /** ScopeByProjectAsync: restrict to the actor's active project assignments unless CEO/Auditor/IT tester. */
  private async scopeByProjectAsync(userId: number, role: string, projectColumn: AnyColumn): Promise<SQL | undefined> {
    if (role === 'CEO' || role === 'Auditor' || await this.canVerifyAllProjectsAsync(userId)) return undefined
    return inArray(projectColumn, this.db
      .select({ projectId: userProjectAssignments.projectId })
      .from(userProjectAssignments)
      .where(and(eq(userProjectAssignments.userId, userId), eq(userProjectAssignments.isActive, true))))
  }

  private async loadOpeningPositionAsync(id: number): Promise<OpeningPositionResponseDto> {
    return single(await loadOpeningPositionsAsync(this.db, eq(openingPositionBatches.id, id), { limit: 2 }))
  }

  private async loadMaterialReturnAsync(id: number): Promise<MaterialReturnResponseDto> {
    return single(await loadMaterialReturnsAsync(this.db, eq(materialReturns.id, id), { limit: 2 }))
  }

  private async loadDisputeResolutionAsync(id: number): Promise<MaterialIssueDisputeResolutionResponseDto> {
    const rows = await this.db
      .select({
        resolution: materialIssueDisputeResolutions,
        projectId: materialIssues.projectId,
        projectName: projects.name,
        materialName: materials.name,
        unit: materials.unit,
        resolvedByName: users.fullName,
      })
      .from(materialIssueDisputeResolutions)
      .innerJoin(materialIssues, eq(materialIssueDisputeResolutions.materialIssueId, materialIssues.id))
      .innerJoin(projects, eq(materialIssues.projectId, projects.id))
      .innerJoin(materials, eq(materialIssues.materialId, materials.id))
      .innerJoin(users, eq(materialIssueDisputeResolutions.resolvedByUserId, users.id))
      .where(eq(materialIssueDisputeResolutions.id, id))
      .limit(2)
    const { resolution, ...names } = single(rows)
    return {
      id: resolution.id,
      resolutionNumber: resolution.resolutionNumber,
      materialIssueId: resolution.materialIssueId,
      projectId: names.projectId,
      projectName: names.projectName,
      materialName: names.materialName,
      unit: names.unit,
      issuedQuantity: resolution.issuedQuantity,
      foremanReceivedQuantity: resolution.foremanReceivedQuantity,
      returnedToStoreQuantity: resolution.returnedToStoreQuantity,
      notes: resolution.notes,
      evidenceReference: resolution.evidenceReference,
      resolvedByName: names.resolvedByName,
      resolvedAt: resolution.resolvedAt,
    }
  }

  private async loadCustodyCloseoutAsync(id: number): Promise<CustodyCloseoutResponseDto> {
    return single(await loadCustodyCloseoutsAsync(this.db, eq(materialCustodyCloseouts.id, id), { limit: 2 }))
  }

  private async loadPeriodAsync(id: number): Promise<OperationalPeriodResponseDto> {
    return single(await loadPeriodsAsync(this.db, eq(operationalPeriods.id, id), { limit: 2 }))
  }

  private async loadCorrectionAsync(id: number): Promise<ControlledCorrectionResponseDto> {
    return single(await loadCorrectionsAsync(this.db, eq(controlledCorrections.id, id), { limit: 2 }))
  }
}

interface PageOptions {
  orderBy?: SQL[]
  limit?: number
}

function single<T>(rows: T[]): T {
  if (rows.length === 0) throw new InvalidOperationError('Sequence contains no elements')
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0]!
}

function singleOrDefault<T>(rows: T[]): T | null {
  if (rows.length > 1) throw new InvalidOperationError('Sequence contains more than one element')
  return rows[0] ?? null
}

async function lockRowAsync(
  db: DbExecutor,
  tableName: 'OpeningPositionBatches' | 'MaterialIssues' | 'MaterialReturns' | 'MaterialCustodyCloseouts' | 'OperationalPeriods' | 'ControlledCorrections',
  id: number,
): Promise<void> {
  await db.execute(sql`SELECT 1 FROM ${sql.identifier(tableName)} WHERE "Id" = ${id} FOR UPDATE`)
}

async function findBatchAsync(db: DbExecutor, id: number): Promise<OpeningPositionBatchRow> {
  const batch = singleOrDefault(await db
    .select()
    .from(openingPositionBatches)
    .where(eq(openingPositionBatches.id, id))
    .limit(2))
  if (batch === null) throw new KeyNotFoundError('The opening position was not found.')
  return batch
}

async function findPeriodAsync(db: DbExecutor, id: number): Promise<OperationalPeriodRow> {
  const period = singleOrDefault(await db.select().from(operationalPeriods).where(eq(operationalPeriods.id, id)).limit(2))
  if (period === null) throw new KeyNotFoundError('The period was not found.')
  return period
}

async function getBalanceAsync(db: DbExecutor, projectId: number, materialId: number) {
  return singleOrDefault(await db
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.projectId, projectId), eq(stockBalances.materialId, materialId)))
    .limit(2))
}

async function hasStockHistoryAsync(db: DbExecutor, projectId: number, materialIds: number[]): Promise<boolean> {
  if (materialIds.length === 0) return false
  const [ledger] = await db
    .select({ id: stockLedgerEntries.id })
    .from(stockLedgerEntries)
    .where(and(eq(stockLedgerEntries.projectId, projectId), inArray(stockLedgerEntries.materialId, materialIds)))
    .limit(1)
  if (ledger) return true
  const [balance] = await db
    .select({ id: stockBalances.id })
    .from(stockBalances)
    .where(and(eq(stockBalances.projectId, projectId), inArray(stockBalances.materialId, materialIds)))
    .limit(1)
  return balance !== undefined
}

async function hasActiveCloseoutAsync(db: DbExecutor, materialIssueId: number): Promise<boolean> {
  const [closeout] = await db
    .select({ id: materialCustodyCloseouts.id })
    .from(materialCustodyCloseouts)
    .where(and(
      eq(materialCustodyCloseouts.materialIssueId, materialIssueId),
      ne(materialCustodyCloseouts.status, CustodyCloseoutStatuses.Returned)))
    .limit(1)
  return closeout !== undefined
}

async function sumUsageAsync(db: DbExecutor, materialIssueId: number, usageType: string | null): Promise<Decimal> {
  const [row] = await db
    .select({ value: sql<string>`COALESCE(SUM(${materialUsageRecords.quantity}), 0)` })
    .from(materialUsageRecords)
    .where(and(
      eq(materialUsageRecords.materialIssueId, materialIssueId),
      usageType !== null ? eq(materialUsageRecords.usageType, usageType) : undefined))
  return dec(row?.value)
}

async function sumReturnsAsync(db: DbExecutor, materialIssueId: number, status: string): Promise<Decimal> {
  const column = status === MaterialReturnStatuses.Received
    ? sql`COALESCE(${materialReturns.quantityAccepted}, 0)`
    : sql`${materialReturns.quantityOffered}`
  const [row] = await db
    .select({ value: sql<string>`COALESCE(SUM(${column}), 0)` })
    .from(materialReturns)
    .where(and(eq(materialReturns.materialIssueId, materialIssueId), eq(materialReturns.status, status)))
  return dec(row?.value)
}

async function getPeriodBlockersAsync(db: DbExecutor, period: OperationalPeriodRow): Promise<string[]> {
  const endExclusive = businessDayEndExclusiveUtc(period.endDate)
  const blockers: string[] = []
  const openingType = period.scope === OperationalPeriodScopes.Inventory
    ? OpeningPositionTypes.Inventory
    : OpeningPositionTypes.Cash
  const pendingOpeningPositions = await countRows(db
    .select({ value: count() })
    .from(openingPositionBatches)
    .where(and(
      eq(openingPositionBatches.projectId, period.projectId),
      eq(openingPositionBatches.positionType, openingType),
      lte(openingPositionBatches.asOfDate, period.endDate),
      inArray(openingPositionBatches.status, [
        OpeningPositionStatuses.AwaitingVerification,
        OpeningPositionStatuses.AwaitingApproval,
      ]))))
  const pendingCorrections = await countRows(db
    .select({ value: count() })
    .from(controlledCorrections)
    .where(and(
      eq(controlledCorrections.projectId, period.projectId),
      eq(controlledCorrections.correctionType, period.scope),
      lt(controlledCorrections.submittedAt, endExclusive),
      eq(controlledCorrections.status, ControlledCorrectionStatuses.AwaitingApproval))))
  if (pendingOpeningPositions > 0) blockers.push(`${pendingOpeningPositions} opening position(s) awaiting a decision`)
  if (pendingCorrections > 0) blockers.push(`${pendingCorrections} controlled correction(s) awaiting a decision`)

  if (period.scope === OperationalPeriodScopes.Inventory) {
    const unclosedCustody = await countRows(db
      .select({ value: count() })
      .from(materialIssues)
      .where(and(
        eq(materialIssues.projectId, period.projectId),
        lt(materialIssues.issuedAt, endExclusive),
        ne(materialIssues.status, MaterialIssueStatuses.Disputed),
        not(exists(db
          .select({ one: sql`1` })
          .from(materialCustodyCloseouts)
          .where(and(
            eq(materialCustodyCloseouts.materialIssueId, materialIssues.id),
            eq(materialCustodyCloseouts.status, CustodyCloseoutStatuses.Approved))))))))
    const disputedCustody = await countRows(db
      .select({ value: count() })
      .from(materialIssues)
      .where(and(
        eq(materialIssues.projectId, period.projectId),
        lt(materialIssues.issuedAt, endExclusive),
        eq(materialIssues.status, MaterialIssueStatuses.Disputed))))
    const pendingTransfers = await countRows(db
      .select({ value: count() })
      .from(stockTransfers)
      .where(and(
        or(eq(stockTransfers.fromProjectId, period.projectId), eq(stockTransfers.toProjectId, period.projectId)),
        lt(stockTransfers.requestedAt, endExclusive),
        ne(stockTransfers.status, StockTransferStatuses.Received),
        ne(stockTransfers.status, StockTransferStatuses.Resolved))))
    const pendingCounts = await countRows(db
      .select({ value: count() })
      .from(stockCounts)
      .where(and(
        eq(stockCounts.projectId, period.projectId),
        lt(stockCounts.countedAt, endExclusive),
        eq(stockCounts.status, StockCountStatuses.AwaitingReview))))
    const technicalCandidates = await db
      .select({
        purchaseOrderLineId: goodsReceipts.purchaseOrderLineId,
        orderedQuantity: purchaseOrderLines.quantity,
        latestOutcome: latestReviewOutcome,
      })
      .from(goodsReceipts)
      .innerJoin(purchaseOrderLines, eq(goodsReceipts.purchaseOrderLineId, purchaseOrderLines.id))
      .where(and(
        eq(goodsReceipts.projectId, period.projectId),
        lt(goodsReceipts.receivedAt, endExclusive),
        eq(purchaseOrderLines.requiresTechnicalAcceptance, true),
        gt(goodsReceipts.acceptedQuantity, 0)))
    const unresolvedTechnicalLines = new Map<number, number>()
    for (const item of technicalCandidates) {
      if (item.latestOutcome !== TechnicalAcceptanceOutcomes.Accepted && !unresolvedTechnicalLines.has(item.purchaseOrderLineId)) {
        unresolvedTechnicalLines.set(item.purchaseOrderLineId, item.orderedQuantity)
      }
    }
    let pendingTechnical = 0
    if (unresolvedTechnicalLines.size !== 0) {
      const acceptedRows = await db
        .select({
          purchaseOrderLineId: goodsReceipts.purchaseOrderLineId,
          quantity: sql<string>`COALESCE(SUM(${goodsReceipts.acceptedQuantity}), 0)`,
        })
        .from(goodsReceipts)
        .where(and(
          inArray(goodsReceipts.purchaseOrderLineId, [...unresolvedTechnicalLines.keys()]),
          gt(goodsReceipts.acceptedQuantity, 0),
          sql`${latestReviewOutcome} = ${TechnicalAcceptanceOutcomes.Accepted}`))
        .groupBy(goodsReceipts.purchaseOrderLineId)
      const acceptedByLine = new Map(acceptedRows.map(row => [row.purchaseOrderLineId, dec(row.quantity)]))
      for (const [lineId, orderedQuantity] of unresolvedTechnicalLines) {
        if ((acceptedByLine.get(lineId) ?? dec(0)).lt(orderedQuantity)) pendingTechnical += 1
      }
    }
    if (unclosedCustody > 0) blockers.push(`${unclosedCustody} custody record(s) not closed`)
    if (disputedCustody > 0) blockers.push(`${disputedCustody} disputed handover(s)`)
    if (pendingTransfers > 0) blockers.push(`${pendingTransfers} transfer(s) not completed`)
    if (pendingCounts > 0) blockers.push(`${pendingCounts} stock count(s) awaiting review`)
    if (pendingTechnical > 0) blockers.push(`${pendingTechnical} delivery check(s) pending`)
  } else {
    const pendingInvoices = await countRows(db
      .select({ value: count() })
      .from(supplierInvoices)
      .where(and(
        eq(supplierInvoices.projectId, period.projectId),
        lt(supplierInvoices.capturedAt, endExclusive),
        ne(supplierInvoices.status, InvoiceStatuses.Paid),
        ne(supplierInvoices.status, InvoiceStatuses.Rejected),
        ne(supplierInvoices.status, InvoiceStatuses.Returned),
        ne(supplierInvoices.status, InvoiceStatuses.Mismatch))))
    const pendingPettyCash = await countRows(db
      .select({ value: count() })
      .from(pettyCashRequests)
      .where(and(
        eq(pettyCashRequests.projectId, period.projectId),
        lt(pettyCashRequests.requestedAt, endExclusive),
        ne(pettyCashRequests.status, PettyCashStatuses.Reconciled),
        ne(pettyCashRequests.status, PettyCashStatuses.Rejected))))
    if (pendingInvoices > 0) blockers.push(`${pendingInvoices} supplier invoice(s) not completed`)
    if (pendingPettyCash > 0) blockers.push(`${pendingPettyCash} petty-cash record(s) not reconciled`)
  }
  return blockers
}

async function countRows(query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query
  return row?.value ?? 0
}

async function loadOpeningPositionsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<OpeningPositionResponseDto[]> {
  let query = db
    .select({ batch: openingPositionBatches, projectName: projects.name, submittedByName: submittedByUser.fullName })
    .from(openingPositionBatches)
    .innerJoin(projects, eq(openingPositionBatches.projectId, projects.id))
    .innerJoin(submittedByUser, eq(openingPositionBatches.submittedByUserId, submittedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.batch.id)
  const inventoryLines = await db
    .select({ line: openingInventoryLines, materialName: materials.name, unit: materials.unit })
    .from(openingInventoryLines)
    .innerJoin(materials, eq(openingInventoryLines.materialId, materials.id))
    .where(inArray(openingInventoryLines.openingPositionBatchId, ids))
  const cashLines = await db
    .select()
    .from(openingCashLines)
    .where(inArray(openingCashLines.openingPositionBatchId, ids))
  const verifications = await db
    .select({ verification: openingPositionVerifications, verifiedByName: users.fullName })
    .from(openingPositionVerifications)
    .innerJoin(users, eq(openingPositionVerifications.verifiedByUserId, users.id))
    .where(inArray(openingPositionVerifications.openingPositionBatchId, ids))
  const decisions = await db
    .select({ decision: openingPositionDecisions, decidedByName: users.fullName })
    .from(openingPositionDecisions)
    .innerJoin(users, eq(openingPositionDecisions.decidedByUserId, users.id))
    .where(inArray(openingPositionDecisions.openingPositionBatchId, ids))

  return rows.map(({ batch, projectName, submittedByName }) => {
    const verification = verifications.find(item => item.verification.openingPositionBatchId === batch.id) ?? null
    const decision = decisions.find(item => item.decision.openingPositionBatchId === batch.id) ?? null
    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      positionType: batch.positionType,
      projectId: batch.projectId,
      projectName,
      asOfDate: batch.asOfDate,
      notes: batch.notes,
      evidenceReference: batch.evidenceReference,
      status: batch.status,
      submittedByName,
      submittedAt: batch.submittedAt,
      verifiedByName: verification?.verifiedByName ?? null,
      verificationNotes: verification?.verification.notes ?? null,
      verifiedAt: verification?.verification.verifiedAt ?? null,
      decidedByName: decision?.decidedByName ?? null,
      decisionNotes: decision?.decision.notes ?? null,
      decidedAt: decision?.decision.decidedAt ?? null,
      inventoryLines: inventoryLines
        .filter(item => item.line.openingPositionBatchId === batch.id)
        .sort((a, b) => compareCultureStrings(a.materialName, b.materialName))
        .map(item => ({
          materialId: item.line.materialId,
          materialName: item.materialName,
          unit: item.unit,
          quantity: item.line.quantity,
          unitCost: item.line.unitCost,
        })),
      cashLines: cashLines
        .filter(line => line.openingPositionBatchId === batch.id)
        .sort((a, b) => compareCultureStrings(a.accountName, b.accountName))
        .map(line => ({ accountName: line.accountName, amount: line.amount })),
    }
  })
}

async function loadMaterialReturnsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<MaterialReturnResponseDto[]> {
  let query = db
    .select({
      materialReturn: materialReturns,
      projectId: materialIssues.projectId,
      projectName: projects.name,
      materialName: materials.name,
      unit: materials.unit,
      returnedByName: returnedByUser.fullName,
      receivedByName: receivedByUser.fullName,
    })
    .from(materialReturns)
    .innerJoin(materialIssues, eq(materialReturns.materialIssueId, materialIssues.id))
    .innerJoin(projects, eq(materialIssues.projectId, projects.id))
    .innerJoin(materials, eq(materialIssues.materialId, materials.id))
    .innerJoin(returnedByUser, eq(materialReturns.returnedByUserId, returnedByUser.id))
    .leftJoin(receivedByUser, eq(materialReturns.receivedByUserId, receivedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(({ materialReturn: item, ...names }) => ({
    id: item.id,
    returnNumber: item.returnNumber,
    materialIssueId: item.materialIssueId,
    projectId: names.projectId,
    projectName: names.projectName,
    materialName: names.materialName,
    unit: names.unit,
    quantityOffered: item.quantityOffered,
    quantityAccepted: item.quantityAccepted,
    condition: item.condition,
    status: item.status,
    returnedByName: names.returnedByName,
    returnedAt: item.returnedAt,
    receivedByName: names.receivedByName,
    receivedAt: item.receivedAt,
    notes: item.notes,
    evidenceReference: item.evidenceReference,
  }))
}

async function loadCustodyCloseoutsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<CustodyCloseoutResponseDto[]> {
  let query = db
    .select({
      closeout: materialCustodyCloseouts,
      projectId: materialIssues.projectId,
      projectName: projects.name,
      materialName: materials.name,
      unit: materials.unit,
      submittedByName: submittedByUser.fullName,
      decisionNotes: materialCustodyCloseoutDecisions.notes,
      decidedAt: materialCustodyCloseoutDecisions.decidedAt,
      decidedByName: decidedByUser.fullName,
    })
    .from(materialCustodyCloseouts)
    .innerJoin(materialIssues, eq(materialCustodyCloseouts.materialIssueId, materialIssues.id))
    .innerJoin(projects, eq(materialIssues.projectId, projects.id))
    .innerJoin(materials, eq(materialIssues.materialId, materials.id))
    .innerJoin(submittedByUser, eq(materialCustodyCloseouts.submittedByUserId, submittedByUser.id))
    .leftJoin(materialCustodyCloseoutDecisions,
      eq(materialCustodyCloseoutDecisions.materialCustodyCloseoutId, materialCustodyCloseouts.id))
    .leftJoin(decidedByUser, eq(materialCustodyCloseoutDecisions.decidedByUserId, decidedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(({ closeout: item, ...names }) => ({
    id: item.id,
    closeoutNumber: item.closeoutNumber,
    materialIssueId: item.materialIssueId,
    revision: item.revision,
    projectId: names.projectId,
    projectName: names.projectName,
    materialName: names.materialName,
    unit: names.unit,
    confirmedQuantity: item.confirmedQuantity,
    usedQuantity: item.usedQuantity,
    wastedQuantity: item.wastedQuantity,
    returnedQuantity: item.returnedQuantity,
    unaccountedQuantity: item.unaccountedQuantity,
    status: item.status,
    submittedByName: names.submittedByName,
    submittedAt: item.submittedAt,
    notes: item.notes,
    evidenceReference: item.evidenceReference,
    decidedByName: names.decidedByName,
    decisionNotes: names.decisionNotes,
    decidedAt: names.decidedAt,
  }))
}

async function loadPeriodsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<OperationalPeriodResponseDto[]> {
  let query = db
    .select({ period: operationalPeriods, projectName: projects.name, createdByName: users.fullName })
    .from(operationalPeriods)
    .innerJoin(projects, eq(operationalPeriods.projectId, projects.id))
    .innerJoin(users, eq(operationalPeriods.createdByUserId, users.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const events = await db
    .select({ event: operationalPeriodEvents, actorName: users.fullName })
    .from(operationalPeriodEvents)
    .innerJoin(users, eq(operationalPeriodEvents.actorUserId, users.id))
    .where(inArray(operationalPeriodEvents.operationalPeriodId, rows.map(row => row.period.id)))
  return rows.map(({ period, projectName, createdByName }) => {
    const latest = events
      .filter(item => item.event.operationalPeriodId === period.id)
      .reduce<(typeof events)[number] | null>((current, item) =>
        current === null || item.event.sequenceNumber > current.event.sequenceNumber ? item : current, null)
    return {
      id: period.id,
      periodNumber: period.periodNumber,
      projectId: period.projectId,
      projectName,
      scope: period.scope,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      createdByName,
      createdAt: period.createdAt,
      latestEventType: latest?.event.eventType ?? null,
      latestEventNotes: latest?.event.notes ?? null,
      latestActorName: latest?.actorName ?? null,
      latestEventAt: latest?.event.occurredAt ?? null,
    }
  })
}

async function loadCorrectionsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: PageOptions,
): Promise<ControlledCorrectionResponseDto[]> {
  let query = db
    .select({
      correction: controlledCorrections,
      periodName: operationalPeriods.name,
      projectName: projects.name,
      materialName: materials.name,
      unit: materials.unit,
      submittedByName: submittedByUser.fullName,
      decisionNotes: controlledCorrectionDecisions.notes,
      decidedAt: controlledCorrectionDecisions.decidedAt,
      decidedByName: decidedByUser.fullName,
    })
    .from(controlledCorrections)
    .innerJoin(operationalPeriods, eq(controlledCorrections.operationalPeriodId, operationalPeriods.id))
    .innerJoin(projects, eq(controlledCorrections.projectId, projects.id))
    .leftJoin(materials, eq(controlledCorrections.materialId, materials.id))
    .innerJoin(submittedByUser, eq(controlledCorrections.submittedByUserId, submittedByUser.id))
    .leftJoin(controlledCorrectionDecisions, eq(controlledCorrectionDecisions.controlledCorrectionId, controlledCorrections.id))
    .leftJoin(decidedByUser, eq(controlledCorrectionDecisions.decidedByUserId, decidedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  return rows.map(({ correction: item, ...names }) => ({
    id: item.id,
    correctionNumber: item.correctionNumber,
    operationalPeriodId: item.operationalPeriodId,
    periodName: names.periodName,
    projectId: item.projectId,
    projectName: names.projectName,
    correctionType: item.correctionType,
    materialId: item.materialId,
    materialName: names.materialName,
    unit: names.unit,
    cashAccountName: item.cashAccountName,
    quantityDelta: item.quantityDelta,
    amountDelta: item.amountDelta,
    reason: item.reason,
    evidenceReference: item.evidenceReference,
    status: item.status,
    submittedByName: names.submittedByName,
    submittedAt: item.submittedAt,
    decidedByName: names.decidedByName,
    decisionNotes: names.decisionNotes,
    decidedAt: names.decidedAt,
  }))
}

function normalizeOpeningType(value: string): string {
  const normalized = InputNormalizer.requiredText(value, 'value', 2, 20)
  if (normalized.toUpperCase() === OpeningPositionTypes.Inventory.toUpperCase()) return OpeningPositionTypes.Inventory
  if (normalized.toUpperCase() === OpeningPositionTypes.Cash.toUpperCase()) return OpeningPositionTypes.Cash
  throw new ArgumentError('Position type must be Inventory or Cash.', 'value')
}

function normalizePeriodScope(value: string): string {
  const normalized = InputNormalizer.requiredText(value, 'value', 2, 20)
  if (normalized.toUpperCase() === OperationalPeriodScopes.Inventory.toUpperCase()) return OperationalPeriodScopes.Inventory
  if (normalized.toUpperCase() === OperationalPeriodScopes.Finance.toUpperCase()) return OperationalPeriodScopes.Finance
  throw new ArgumentError('Period scope must be Inventory or Finance.', 'value')
}

function validateOptionalProjectId(projectId: number | null): void {
  if (projectId !== null && projectId <= 0) throw new ArgumentError('Project ID must be positive.', 'projectId')
}

function ensureSignedPrecision(value: number, name: string, precision: number, scale: number): void {
  if (!DecimalPrecision.fits(value, precision, scale)) {
    throw new ArgumentOutOfRangeError(name, `The value must fit within ${precision} digits and ${scale} decimal places.`)
  }
}

/** `DateOnly.FromDateTime(DateTime.UtcNow + 3h)` — the East Africa business date. */
function businessToday(): string {
  return new Date(Date.now() + BusinessUtcOffsetMs).toISOString().slice(0, 10)
}

/** Midnight (UTC+3) after the given business date, as a UTC instant. */
function businessDayEndExclusiveUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + 1) - BusinessUtcOffsetMs)
}

/** C# custom format `0.###`: at most three decimals, trailing zeros dropped, midpoint away from zero. */
function formatUpToThreeDecimals(value: Decimal): string {
  return value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed()
}

/** `$"{prefix}-{now:yyMMdd}-{RandomNumberGenerator.GetInt32(1000, 10_000)}"` */
function reference(prefix: string, now: Date): string {
  const iso = now.toISOString()
  return `${prefix}-${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${randomInt(1000, 10_000)}`
}

