import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, ne, isNotNull } from 'drizzle-orm'
import {
  ArgumentError,
  ArgumentOutOfRangeError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import type {
  EvidenceDocumentResponseDto,
  EvidenceDownload,
  EvidenceUploadCommand,
  StoredEvidenceFile,
} from '@/ConstructionMS.Application/DTOs/Evidence/EvidenceDtos'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IEvidenceService } from '@/ConstructionMS.Application/Services/Evidence/IEvidenceService'
import type { IEvidenceStorage } from '@/ConstructionMS.Application/Services/Evidence/IEvidenceStorage'
import { EvidenceKinds, EvidenceSourceTypes } from '@/ConstructionMS.Domain/Entities/EvidenceEntities'
import {
  ControlledCorrectionTypes,
  MaterialReturnStatuses,
  OpeningPositionTypes,
} from '@/ConstructionMS.Domain/Entities/ControlWorkspaceEntities'
import type { AppDbContext } from '../../Data/AppDbContext'
import {
  controlledCorrections,
  evidenceAttachments,
  evidenceDocuments,
  goodsReceiptTechnicalAcceptances,
  goodsReceipts,
  materialCustodyCloseouts,
  materialIssueDisputeResolutions,
  materialIssues,
  materialReturns,
  materialUsageRecords,
  openingPositionBatches,
  paymentAuthorizations,
  payments,
  pettyCashDisbursements,
  pettyCashReconciliations,
  pettyCashRequests,
  projectProgressVerifications,
  projects,
  supplierInvoices,
  userProjectAssignments,
  users,
} from '../../Data/schema'

const INT_MAX = 2_147_483_647

interface EvidenceSourceContext {
  projectId: number
  ownerUserId: number
  uploadRole: string
  readRoles: ReadonlySet<string>
  allowedKinds: ReadonlySet<string>
  restrictForemanToOwner: boolean
}

const roleSet = (...roles: string[]): ReadonlySet<string> => new Set(roles)
const kindSet = (...kinds: string[]): ReadonlySet<string> => new Set(kinds)

const ProjectReaders = roleSet(
  'CEO', 'Supervisor', 'Engineer', 'Foreman', 'Storekeeper',
  'Procurement Officer', 'Finance Officer', 'Auditor')
const ReceiptReaders = roleSet(
  'Storekeeper', 'Procurement Officer', 'Finance Officer', 'Engineer', 'CEO', 'Auditor')
const TechnicalAcceptanceReaders = roleSet('Engineer', 'Finance Officer', 'CEO', 'Auditor')
const MaterialUsageReaders = roleSet(
  'Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'Finance Officer', 'CEO', 'Auditor')
const InvoiceReaders = roleSet('Procurement Officer', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
const PaymentReaders = roleSet('Supervisor', 'Finance Officer', 'CEO', 'Auditor')
const PettyCashReaders = roleSet('Supervisor', 'Finance Officer', 'CEO', 'Auditor')
const OpeningPositionReaders = roleSet('Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')
const CustodyReaders = roleSet('Storekeeper', 'Foreman', 'Supervisor', 'Engineer', 'CEO', 'Auditor')
const CorrectionReaders = roleSet('Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor')

const ProgressKinds = kindSet(EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Other)
const ReceiptKinds = kindSet(EvidenceKinds.Photo, EvidenceKinds.DeliveryNote, EvidenceKinds.Other)
const InspectionKinds = kindSet(EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Other)
const UsageKinds = kindSet(EvidenceKinds.Photo, EvidenceKinds.Receipt, EvidenceKinds.Other)
const InvoiceKinds = kindSet(EvidenceKinds.Invoice, EvidenceKinds.Other)
const PaymentKinds = kindSet(EvidenceKinds.PaymentProof, EvidenceKinds.Receipt, EvidenceKinds.Other)
const AccountabilityKinds = kindSet(EvidenceKinds.Receipt, EvidenceKinds.Photo, EvidenceKinds.Other)
const OpeningKinds = kindSet(
  EvidenceKinds.Photo, EvidenceKinds.Inspection, EvidenceKinds.Receipt, EvidenceKinds.Other)

export class EvidenceService implements IEvidenceService {
  constructor(
    private readonly db: AppDbContext,
    private readonly roles: IActorRoleResolver,
    private readonly storage: IEvidenceStorage,
  ) {}

  async uploadAsync(command: EvidenceUploadCommand, actorUserId: number, actorRole: string): Promise<EvidenceDocumentResponseDto> {
    if (command === null || command === undefined) throw new ArgumentError('Value cannot be null.', 'command')
    const actor = await this.requireActorAsync(actorUserId, actorRole)
    const sourceType = canonicalValue(command.sourceType, EvidenceSourceTypes.All, 'Evidence source type is not supported.')
    if (command.sourceId <= 0) {
      throw new ArgumentOutOfRangeError('SourceId', 'Specified argument was out of the range of valid values.')
    }
    const source = await this.resolveSourceAsync(sourceType, command.sourceId)
    const evidenceKind = canonicalValue(command.evidenceKind, source.allowedKinds, 'Evidence kind is not valid for this source.')

    if (actor.effectiveRole !== source.uploadRole || source.ownerUserId !== actorUserId) {
      throw new UnauthorizedAccessError('Only the user who recorded this source may attach its evidence.')
    }
    await this.requireProjectScopeAsync(actor, source.projectId)

    let stored: StoredEvidenceFile | null = null
    let databaseCommitted = false
    try {
      stored = await this.storage.storeAsync(
        command.content,
        command.originalFileName,
        command.claimedContentType,
        command.declaredLength)

      const now = new Date()
      const documentId = randomUUID()
      const storedFile = stored
      await this.db.transaction(async tx => {
        await tx.insert(evidenceDocuments).values({
          id: documentId,
          projectId: source.projectId,
          storageKey: storedFile.storageKey,
          originalFileName: storedFile.originalFileName,
          contentType: storedFile.contentType,
          sizeBytes: storedFile.sizeBytes,
          sha256Hash: storedFile.sha256Hash,
          uploadedByUserId: actorUserId,
          uploadedAt: now,
        })
        await tx.insert(evidenceAttachments).values({
          evidenceDocumentId: documentId,
          projectId: source.projectId,
          sourceType,
          sourceId: command.sourceId,
          evidenceKind,
          linkedByUserId: actorUserId,
          linkedAt: now,
        })
      })
      databaseCommitted = true
      return await this.loadResponseAsync(documentId)
    } catch (error) {
      if (stored !== null && !databaseCommitted) await this.storage.deleteIfExistsAsync(stored.storageKey)
      throw error
    }
  }

  async getForSourceAsync(sourceType: string, sourceId: number, actorUserId: number, actorRole: string): Promise<EvidenceDocumentResponseDto[]> {
    const actor = await this.requireActorAsync(actorUserId, actorRole)
    const canonicalSourceType = canonicalValue(sourceType, EvidenceSourceTypes.All, 'Evidence source type is not supported.')
    if (sourceId <= 0) {
      throw new ArgumentOutOfRangeError('sourceId', 'Specified argument was out of the range of valid values.')
    }
    const source = await this.resolveSourceAsync(canonicalSourceType, sourceId)
    await this.requireReadAccessAsync(actor, source)

    const rows = await this.responseQuery()
      .where(and(
        eq(evidenceAttachments.sourceType, canonicalSourceType),
        eq(evidenceAttachments.sourceId, sourceId),
        eq(evidenceDocuments.projectId, source.projectId)))
      .orderBy(desc(evidenceDocuments.uploadedAt), desc(evidenceDocuments.id))
    return rows.map(toDto)
  }

  async openDownloadAsync(documentId: string, actorUserId: number, actorRole: string): Promise<EvidenceDownload> {
    if (documentId === '00000000-0000-0000-0000-000000000000') {
      throw new ArgumentError('Evidence document ID is required.', 'documentId')
    }
    const actor = await this.requireActorAsync(actorUserId, actorRole)
    const [document] = await this.db
      .select({
        document: evidenceDocuments,
        attachmentProjectId: evidenceAttachments.projectId,
        sourceType: evidenceAttachments.sourceType,
        sourceId: evidenceAttachments.sourceId,
      })
      .from(evidenceDocuments)
      .innerJoin(evidenceAttachments, eq(evidenceAttachments.evidenceDocumentId, evidenceDocuments.id))
      .where(eq(evidenceDocuments.id, documentId))
      .limit(1)
    if (!document) throw new KeyNotFoundError('The evidence document was not found.')

    const source = await this.resolveSourceAsync(document.sourceType, document.sourceId)
    if (source.projectId !== document.document.projectId
      || document.attachmentProjectId !== document.document.projectId) {
      throw new InvalidOperationError('The evidence project link is inconsistent.')
    }
    await this.requireReadAccessAsync(actor, source)

    const content = await this.storage.openReadAsync(document.document.storageKey)
    return {
      content,
      contentType: document.document.contentType,
      fileName: document.document.originalFileName,
      sizeBytes: document.document.sizeBytes,
    }
  }

  private async loadResponseAsync(documentId: string): Promise<EvidenceDocumentResponseDto> {
    const [row] = await this.responseQuery().where(eq(evidenceDocuments.id, documentId)).limit(1)
    if (!row) throw new InvalidOperationError('Sequence contains no elements')
    return toDto(row)
  }

  private responseQuery() {
    return this.db
      .select({
        id: evidenceDocuments.id,
        projectId: evidenceDocuments.projectId,
        projectName: projects.name,
        sourceType: evidenceAttachments.sourceType,
        sourceId: evidenceAttachments.sourceId,
        evidenceKind: evidenceAttachments.evidenceKind,
        originalFileName: evidenceDocuments.originalFileName,
        contentType: evidenceDocuments.contentType,
        sizeBytes: evidenceDocuments.sizeBytes,
        sha256Hash: evidenceDocuments.sha256Hash,
        uploadedByUserId: evidenceDocuments.uploadedByUserId,
        uploadedByName: users.fullName,
        uploadedAt: evidenceDocuments.uploadedAt,
      })
      .from(evidenceDocuments)
      .innerJoin(projects, eq(projects.id, evidenceDocuments.projectId))
      .innerJoin(users, eq(users.id, evidenceDocuments.uploadedByUserId))
      .innerJoin(evidenceAttachments, eq(evidenceAttachments.evidenceDocumentId, evidenceDocuments.id))
  }

  private async requireReadAccessAsync(actor: ActorRoleContext, source: EvidenceSourceContext): Promise<void> {
    if (!source.readRoles.has(actor.effectiveRole)) {
      throw new UnauthorizedAccessError('Your role cannot view evidence for this record type.')
    }
    if (source.restrictForemanToOwner
      && actor.effectiveRole === 'Foreman'
      && actor.userId !== source.ownerUserId) {
      throw new UnauthorizedAccessError('Foremen may view evidence only for their own material custody records.')
    }
    await this.requireProjectScopeAsync(actor, source.projectId)
  }

  private async requireProjectScopeAsync(actor: ActorRoleContext, projectId: number): Promise<void> {
    if (actor.canSwitchRoles || actor.effectiveRole === 'CEO' || actor.effectiveRole === 'Auditor') return
    const [assigned] = await this.db
      .select({ id: userProjectAssignments.id })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actor.userId),
        eq(userProjectAssignments.projectId, projectId),
        eq(userProjectAssignments.isActive, true),
        isNull(userProjectAssignments.endedAt)))
      .limit(1)
    if (!assigned) throw new UnauthorizedAccessError("You are not assigned to this evidence's project.")
  }

  private async requireActorAsync(actorUserId: number, actorRole: string): Promise<ActorRoleContext> {
    const actor = await this.roles.resolveAsync(actorUserId)
    if (actor === null || actor.effectiveRole !== actorRole) {
      throw new UnauthorizedAccessError('The active role could not be verified.')
    }
    return actor
  }

  private async resolveSourceAsync(sourceType: string, sourceId: number): Promise<EvidenceSourceContext> {
    switch (sourceType) {
      case EvidenceSourceTypes.ProjectProgressVerification: {
        if (sourceId > INT_MAX) throw sourceNotFound()
        const [item] = await this.db
          .select({ projectId: projectProgressVerifications.projectId, ownerId: projectProgressVerifications.verifiedByUserId })
          .from(projectProgressVerifications)
          .where(eq(projectProgressVerifications.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Engineer', ProjectReaders, ProgressKinds, false)
      }
      case EvidenceSourceTypes.GoodsReceipt: {
        const [item] = await this.db
          .select({ projectId: goodsReceipts.projectId, ownerId: goodsReceipts.receivedByUserId })
          .from(goodsReceipts)
          .where(eq(goodsReceipts.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Storekeeper', ReceiptReaders, ReceiptKinds, false)
      }
      case EvidenceSourceTypes.GoodsReceiptTechnicalAcceptance: {
        const [item] = await this.db
          .select({ projectId: goodsReceipts.projectId, ownerId: goodsReceiptTechnicalAcceptances.engineerUserId })
          .from(goodsReceiptTechnicalAcceptances)
          .innerJoin(goodsReceipts, eq(goodsReceipts.id, goodsReceiptTechnicalAcceptances.goodsReceiptId))
          .where(eq(goodsReceiptTechnicalAcceptances.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Engineer', TechnicalAcceptanceReaders, InspectionKinds, false)
      }
      case EvidenceSourceTypes.MaterialUsageRecord: {
        const [item] = await this.db
          .select({ projectId: materialIssues.projectId, ownerId: materialUsageRecords.recordedByUserId })
          .from(materialUsageRecords)
          .innerJoin(materialIssues, eq(materialIssues.id, materialUsageRecords.materialIssueId))
          .where(eq(materialUsageRecords.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Foreman', MaterialUsageReaders, UsageKinds, true)
      }
      case EvidenceSourceTypes.SupplierInvoice: {
        const [item] = await this.db
          .select({ projectId: supplierInvoices.projectId, ownerId: supplierInvoices.capturedByUserId })
          .from(supplierInvoices)
          .where(eq(supplierInvoices.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Procurement Officer', InvoiceReaders, InvoiceKinds, false)
      }
      case EvidenceSourceTypes.Payment: {
        const [item] = await this.db
          .select({ projectId: supplierInvoices.projectId, ownerId: payments.paidByUserId })
          .from(payments)
          .innerJoin(paymentAuthorizations, eq(paymentAuthorizations.id, payments.paymentAuthorizationId))
          .innerJoin(supplierInvoices, eq(supplierInvoices.id, paymentAuthorizations.supplierInvoiceId))
          .where(eq(payments.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Finance Officer', PaymentReaders, PaymentKinds, false)
      }
      case EvidenceSourceTypes.PettyCashDisbursement: {
        const [item] = await this.db
          .select({ projectId: pettyCashRequests.projectId, ownerId: pettyCashDisbursements.disbursedByUserId })
          .from(pettyCashDisbursements)
          .innerJoin(pettyCashRequests, eq(pettyCashRequests.id, pettyCashDisbursements.pettyCashRequestId))
          .where(eq(pettyCashDisbursements.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Finance Officer', PettyCashReaders, PaymentKinds, false)
      }
      case EvidenceSourceTypes.PettyCashReconciliation: {
        const [item] = await this.db
          .select({ projectId: pettyCashRequests.projectId, ownerId: pettyCashReconciliations.submittedByUserId })
          .from(pettyCashReconciliations)
          .innerJoin(pettyCashRequests, eq(pettyCashRequests.id, pettyCashReconciliations.pettyCashRequestId))
          .where(eq(pettyCashReconciliations.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Supervisor', PettyCashReaders, AccountabilityKinds, false)
      }
      case EvidenceSourceTypes.OpeningPositionBatch: {
        const [item] = await this.db
          .select({
            projectId: openingPositionBatches.projectId,
            ownerId: openingPositionBatches.submittedByUserId,
            positionType: openingPositionBatches.positionType,
          })
          .from(openingPositionBatches)
          .where(eq(openingPositionBatches.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        const role = item.positionType === OpeningPositionTypes.Inventory ? 'Storekeeper' : 'Finance Officer'
        return context(item.projectId, item.ownerId, role, OpeningPositionReaders, OpeningKinds, false)
      }
      case EvidenceSourceTypes.MaterialReturn: {
        const [item] = await this.db
          .select({ projectId: materialIssues.projectId, ownerId: materialReturns.returnedByUserId })
          .from(materialReturns)
          .innerJoin(materialIssues, eq(materialIssues.id, materialReturns.materialIssueId))
          .where(eq(materialReturns.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Foreman', CustodyReaders, OpeningKinds, true)
      }
      case EvidenceSourceTypes.MaterialReturnReceipt: {
        const [item] = await this.db
          .select({ projectId: materialIssues.projectId, ownerId: materialReturns.receivedByUserId })
          .from(materialReturns)
          .innerJoin(materialIssues, eq(materialIssues.id, materialReturns.materialIssueId))
          .where(and(
            eq(materialReturns.id, sourceId),
            ne(materialReturns.status, MaterialReturnStatuses.AwaitingReceipt),
            isNotNull(materialReturns.receivedByUserId)))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId!, 'Storekeeper', CustodyReaders, OpeningKinds, false)
      }
      case EvidenceSourceTypes.MaterialIssueDisputeResolution: {
        const [item] = await this.db
          .select({ projectId: materialIssues.projectId, ownerId: materialIssueDisputeResolutions.resolvedByUserId })
          .from(materialIssueDisputeResolutions)
          .innerJoin(materialIssues, eq(materialIssues.id, materialIssueDisputeResolutions.materialIssueId))
          .where(eq(materialIssueDisputeResolutions.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Supervisor', CustodyReaders, OpeningKinds, false)
      }
      case EvidenceSourceTypes.MaterialCustodyCloseout: {
        const [item] = await this.db
          .select({ projectId: materialIssues.projectId, ownerId: materialCustodyCloseouts.submittedByUserId })
          .from(materialCustodyCloseouts)
          .innerJoin(materialIssues, eq(materialIssues.id, materialCustodyCloseouts.materialIssueId))
          .where(eq(materialCustodyCloseouts.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        return context(item.projectId, item.ownerId, 'Foreman', CustodyReaders, OpeningKinds, true)
      }
      case EvidenceSourceTypes.ControlledCorrection: {
        const [item] = await this.db
          .select({
            projectId: controlledCorrections.projectId,
            ownerId: controlledCorrections.submittedByUserId,
            correctionType: controlledCorrections.correctionType,
          })
          .from(controlledCorrections)
          .where(eq(controlledCorrections.id, sourceId))
          .limit(1)
        if (!item) throw sourceNotFound()
        const role = item.correctionType === ControlledCorrectionTypes.Inventory ? 'Storekeeper' : 'Finance Officer'
        return context(item.projectId, item.ownerId, role, CorrectionReaders, OpeningKinds, false)
      }
      default:
        throw new ArgumentError('Evidence source type is not supported.', 'sourceType')
    }
  }
}

function context(
  projectId: number,
  ownerUserId: number,
  uploadRole: string,
  readRoles: ReadonlySet<string>,
  allowedKinds: ReadonlySet<string>,
  restrictForemanToOwner: boolean,
): EvidenceSourceContext {
  return { projectId, ownerUserId, uploadRole, readRoles, allowedKinds, restrictForemanToOwner }
}

function toDto(item: EvidenceDocumentResponseDto): EvidenceDocumentResponseDto {
  return {
    id: item.id,
    projectId: item.projectId,
    projectName: item.projectName,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    evidenceKind: item.evidenceKind,
    originalFileName: item.originalFileName,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    sha256Hash: item.sha256Hash,
    uploadedByUserId: item.uploadedByUserId,
    uploadedByName: item.uploadedByName,
    uploadedAt: item.uploadedAt,
  }
}

function canonicalValue(value: string | null | undefined, allowed: Iterable<string>, errorMessage: string): string {
  if (value === null || value === undefined || value.trim() === '') throw new ArgumentError(errorMessage)
  const trimmed = value.trim().toLowerCase()
  for (const item of allowed) {
    if (item.toLowerCase() === trimmed) return item
  }
  throw new ArgumentError(errorMessage)
}

function sourceNotFound(): KeyNotFoundError {
  return new KeyNotFoundError('The evidence source record was not found.')
}
