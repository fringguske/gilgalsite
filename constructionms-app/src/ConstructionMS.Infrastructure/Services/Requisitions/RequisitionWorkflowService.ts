import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ArgumentError } from '@/ConstructionMS.Application/Common/Exceptions'
import { OperationErrorKind, OperationResult } from '@/ConstructionMS.Application/Common/OperationResult'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateRequisitionV1RequestDto'
import type { CreateStockReplenishmentRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/CreateStockReplenishmentRequestDto'
import type { RequisitionProgressDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/RequisitionProgressDto'
import type { RequisitionWorkflowResponseDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/RequisitionWorkflowResponseDto'
import type { SupervisorDecisionRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/SupervisorDecisionRequestDto'
import type { TechnicalCheckRequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/TechnicalCheckRequestDto'
import type { UpdateRequisitionV1RequestDto } from '@/ConstructionMS.Application/DTOs/Requisitions/V1/UpdateRequisitionV1RequestDto'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IRequisitionWorkflowService } from '@/ConstructionMS.Application/Services/Requisitions/IRequisitionWorkflowService'
import { RequisitionTypes } from '@/ConstructionMS.Domain/Entities/Requisition'
import { RequisitionWorkflowStates } from '@/ConstructionMS.Domain/Entities/RequisitionWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { serializeJson } from '../../Common/SystemTextJson'
import type { AppDbContext, DbExecutor } from '../../Data/AppDbContext'
import {
  costCodes,
  engineerTechnicalChecks,
  materials,
  projects,
  requisitionApprovalEvents,
  requisitions,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { toRoundTripString } from '../ControlEventWriter'
import { loadRequisitionProgressAsync, type ProgressVisibility } from './RequisitionProgressReader'

type RequisitionRow = typeof requisitions.$inferSelect

const ForemanRole = 'Foreman'
const StorekeeperRole = 'Storekeeper'
const EngineerRole = 'Engineer'
const SupervisorRole = 'Supervisor'
const CeoRole = 'CEO'
const AuditorRole = 'Auditor'
/** Store restock requests carry no reason of their own; this fills the required purpose. */
const StoreRestockPurpose = 'Restock the project store'
/** The purpose is optional, but the column must not be blank. */
const NoPurposeGiven = 'Not given'

const ReadRoles: ReadonlySet<string> = new Set([
  CeoRole,
  AuditorRole,
  ForemanRole,
  EngineerRole,
  SupervisorRole,
  'Procurement Officer',
  StorekeeperRole,
])

const requestedByUser = alias(users, 'requested_by_user')
const approvedByUser = alias(users, 'approved_by_user')

interface ActorContext {
  userId: number
  name: string
  role: string
  canSwitchRoles: boolean
}

interface LoadedRequisition {
  requisition: RequisitionRow
  projectName: string | null
  materialName: string | null
  materialUnit: string | null
  costCode: string | null
  costCodeName: string | null
  requestedByUserName: string | null
  approvedByUserName: string | null
  technicalChecks: {
    id: number
    outcome: string
    comments: string | null
    engineerUserId: number
    engineerName: string | null
    checkedAt: Date
    requisitionRevision: number
  }[]
  approvalEvents: {
    sequenceNumber: number
    eventType: string
    actorName: string | null
    actorRole: string
    fromStatus: string | null
    toStatus: string
    comments: string | null
    eventDataJson: string
    occurredAt: Date
    eventHash: string
  }[]
}

interface ApprovalEventInsert {
  requisitionId: number
  sequenceNumber: number
  eventType: string
  actorUserId: number
  actorRole: string
  fromStatus: string | null
  toStatus: string
  comments: string | null
  eventDataJson: string
  occurredAt: Date
  previousEventHash: string | null
  eventHash: string
}

/**
 * Implements the authenticated Foreman -> Supervisor requisition path (the Engineer
 * technical check step is bypassed so requests go straight to the Supervisor decision).
 * Actor IDs are supplied by the API from authentication claims and then verified
 * again against the database role and active project assignment.
 */
export class RequisitionWorkflowService implements IRequisitionWorkflowService {
  constructor(
    private readonly db: AppDbContext,
    private readonly actorRoleResolver: IActorRoleResolver,
  ) {}

  async getAllAsync(
    actorUserId: number,
    page: number,
    pageSize: number,
    status: string | null,
    projectId: number | null,
  ): Promise<OperationResult<PaginatedResult<RequisitionWorkflowResponseDto>>> {
    const actor = await this.getActorAsync(actorUserId)
    if (actor === null) {
      return failure(OperationErrorKind.Forbidden, 'The authenticated user is inactive or does not exist.')
    }

    if (!ReadRoles.has(actor.role)) {
      return failure(OperationErrorKind.Forbidden, 'Your role cannot view material requisitions.')
    }

    const normalizedStatus = normalizeStatus(status)
    if (status !== null && normalizedStatus === null) {
      return failure(OperationErrorKind.Validation, 'The requisition status filter is invalid.')
    }

    if (projectId !== null && projectId <= 0) {
      return failure(OperationErrorKind.Validation, 'The project ID must be greater than zero.')
    }

    const pagination = Pagination.normalize(page, pageSize)
    const filter = and(
      ...this.readScope(actor),
      normalizedStatus !== null ? eq(requisitions.status, normalizedStatus) : undefined,
      projectId !== null ? eq(requisitions.projectId, projectId) : undefined)

    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(requisitions)
      .where(filter)
    const rows = await loadRequisitionsAsync(this.db, filter, {
      orderBy: [desc(requisitions.createdAt), desc(requisitions.id)],
      offset: pagination.offset,
      limit: pagination.pageSize,
    })
    const progress = await loadRequisitionProgressAsync(this.db, rows, progressVisibility(actor.role))

    return OperationResult.success(createPaginatedResult({
      items: rows.map(row => toDto(row, actor.role, progress.get(row.requisition.id)!)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }))
  }

  async getByIdAsync(actorUserId: number, requisitionId: number): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    if (requisitionId <= 0) {
      return failure(OperationErrorKind.Validation, 'The requisition ID must be greater than zero.')
    }

    const actor = await this.getActorAsync(actorUserId)
    if (actor === null || !ReadRoles.has(actor.role)) {
      return failure(OperationErrorKind.Forbidden, 'Your account cannot view material requisitions.')
    }

    const [requisition] = await loadRequisitionsAsync(
      this.db,
      and(...this.readScope(actor), eq(requisitions.id, requisitionId)),
      { limit: 1 })

    return requisition === undefined
      ? failure(OperationErrorKind.NotFound, 'The requisition was not found in your assigned projects.')
      : OperationResult.success(toDto(requisition, actor.role, await this.loadProgressAsync(requisition, actor.role)))
  }

  async createAsync(
    actorUserId: number,
    request: CreateRequisitionV1RequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const actorResult = await this.requireActorAsync(actorUserId, ForemanRole)
    if (!actorResult.succeeded) {
      return failure(actorResult.errorKind, actorResult.error!)
    }

    const validation = validateRequestFields(
      request.projectId,
      request.materialId,
      request.costCodeId,
      request.quantity,
      request.neededByDate,
      request.purpose,
      request.notes)
    if (!validation.succeeded) {
      return failure(validation.errorKind, validation.error!)
    }

    if (!await this.hasProjectAccessAsync(actorUserId, request.projectId)) {
      return failure(OperationErrorKind.Forbidden, 'You are not assigned to the selected project.')
    }

    const projectRows = await this.db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, request.projectId))
      .limit(1)
    const projectStatus = projectRows[0]?.status
    if (projectStatus === undefined) {
      return failure(OperationErrorKind.Validation, 'The selected project does not exist.')
    }

    if (projectStatus !== 'Active') {
      return failure(
        OperationErrorKind.Conflict,
        `Material requests cannot be created while the project status is ${projectStatus}.`)
    }

    if (!await this.materialExistsAsync(request.materialId)) {
      return failure(OperationErrorKind.Validation, 'The selected material does not exist.')
    }

    if (!await this.isCostCodeActiveAsync(request.costCodeId, request.projectId)) {
      return failure(OperationErrorKind.Validation, 'The selected cost code is not active for this project.')
    }

    const now = new Date()
    const purpose = InputNormalizer.optionalText(request.purpose, 'Purpose', 500) ?? NoPurposeGiven
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const actor = actorResult.value!

    const requisitionId = await this.db.transaction(async (tx) => {
      const [requisition] = await tx
        .insert(requisitions)
        .values({
          projectId: request.projectId,
          materialId: request.materialId,
          costCodeId: request.costCodeId,
          requestType: RequisitionTypes.SiteUse,
          quantity: request.quantity,
          neededByDate: request.neededByDate,
          purpose,
          notes,
          requestedByUserId: actorUserId,
          status: RequisitionWorkflowStates.AwaitingSupervisorDecision,
          workflowRevision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: requisitions.id })

      await insertEvent(tx, createEvent(
        requisition!.id,
        1,
        'Requested',
        actor,
        null,
        RequisitionWorkflowStates.AwaitingSupervisorDecision,
        purpose,
        serializeRequisitionSnapshot(
          request.projectId,
          request.materialId,
          request.costCodeId,
          request.quantity,
          request.neededByDate,
          purpose,
          notes),
        now,
        null))
      return requisition!.id
    })

    return await this.loadCommandResultAsync(actor, requisitionId)
  }

  async createStockReplenishmentAsync(
    actorUserId: number,
    request: CreateStockReplenishmentRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const actorResult = await this.requireActorAsync(actorUserId, StorekeeperRole)
    if (!actorResult.succeeded) {
      return failure(actorResult.errorKind, actorResult.error!)
    }

    const validation = validateRequestFields(
      request.projectId,
      request.materialId,
      request.costCodeId,
      request.quantity,
      request.neededByDate,
      StoreRestockPurpose,
      request.notes)
    if (!validation.succeeded) {
      return failure(validation.errorKind, validation.error!)
    }

    if (!await this.hasProjectAccessAsync(actorUserId, request.projectId)) {
      return failure(OperationErrorKind.Forbidden, 'You are not assigned to the selected project store.')
    }

    if (!await this.isProjectOperationalAsync(request.projectId)) {
      return failure(OperationErrorKind.Conflict, 'Stock replenishment can be requested only for an active project.')
    }

    if (!await this.materialExistsAsync(request.materialId)) {
      return failure(OperationErrorKind.Validation, 'The selected material does not exist.')
    }

    if (!await this.isCostCodeActiveAsync(request.costCodeId, request.projectId)) {
      return failure(OperationErrorKind.Validation, 'The selected cost code is not active for this project.')
    }

    const now = new Date()
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const actor = actorResult.value!

    const requisitionId = await this.db.transaction(async (tx) => {
      const [requisition] = await tx
        .insert(requisitions)
        .values({
          projectId: request.projectId,
          materialId: request.materialId,
          costCodeId: request.costCodeId,
          requestType: RequisitionTypes.StockReplenishment,
          quantity: request.quantity,
          neededByDate: request.neededByDate,
          purpose: StoreRestockPurpose,
          notes,
          requestedByUserId: actorUserId,
          status: RequisitionWorkflowStates.AwaitingSupervisorDecision,
          workflowRevision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: requisitions.id })

      await insertEvent(tx, createEvent(
        requisition!.id,
        1,
        'StockReplenishmentRequested',
        actor,
        null,
        RequisitionWorkflowStates.AwaitingSupervisorDecision,
        StoreRestockPurpose,
        serializeRequisitionSnapshot(
          request.projectId,
          request.materialId,
          request.costCodeId,
          request.quantity,
          request.neededByDate,
          StoreRestockPurpose,
          notes,
          RequisitionTypes.StockReplenishment),
        now,
        null))
      return requisition!.id
    })

    return await this.loadCommandResultAsync(actor, requisitionId)
  }

  async updateAsync(
    actorUserId: number,
    requisitionId: number,
    request: UpdateRequisitionV1RequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const actorResult = await this.requireActorAsync(actorUserId, ForemanRole)
    if (!actorResult.succeeded) {
      return failure(actorResult.errorKind, actorResult.error!)
    }

    const requisition = await this.findForCommandAsync(requisitionId)
    if (requisition === null) {
      return failure(OperationErrorKind.NotFound, 'The requisition was not found.')
    }

    if (requisition.requestedByUserId !== actorUserId) {
      return failure(OperationErrorKind.Forbidden, 'Only the foreman who created this requisition may revise it.')
    }

    if (!await this.hasProjectAccessAsync(actorUserId, requisition.projectId)) {
      return failure(OperationErrorKind.Forbidden, "You are no longer assigned to this requisition's project.")
    }

    if (requisition.status !== RequisitionWorkflowStates.AwaitingTechnicalCheck
      && requisition.status !== RequisitionWorkflowStates.ReturnedForRevision) {
      return failure(
        OperationErrorKind.Conflict,
        'Only a requisition awaiting technical review or returned for revision may be edited.')
    }

    if (requisition.workflowRevision !== request.expectedRevision) {
      return revisionConflict()
    }

    const validation = validateRequestFields(
      requisition.projectId,
      requisition.materialId,
      request.costCodeId,
      request.quantity,
      request.neededByDate,
      request.purpose,
      request.notes)
    if (!validation.succeeded) {
      return failure(validation.errorKind, validation.error!)
    }

    if (!await this.isProjectOperationalAsync(requisition.projectId)) {
      return failure(OperationErrorKind.Conflict, 'This requisition cannot be revised while the project is not active.')
    }

    if (!await this.isCostCodeActiveAsync(request.costCodeId, requisition.projectId)) {
      return failure(OperationErrorKind.Validation, 'The selected cost code is not active for this project.')
    }

    const purpose = InputNormalizer.optionalText(request.purpose, 'Purpose', 500) ?? NoPurposeGiven
    const notes = InputNormalizer.optionalText(request.notes, 'Notes', 1_000)
    const now = new Date()
    const newRevision = requisition.workflowRevision + 1
    const previousHash = await this.getLatestEventHashAsync(requisition.id)
    const actor = actorResult.value!

    const saved = await this.db.transaction(async (tx) => {
      const changedRows = await tx
        .update(requisitions)
        .set({
          quantity: request.quantity,
          costCodeId: request.costCodeId,
          neededByDate: request.neededByDate,
          purpose,
          notes,
          status: RequisitionWorkflowStates.AwaitingSupervisorDecision,
          updatedAt: now,
          workflowRevision: newRevision,
        })
        .where(and(
          eq(requisitions.id, requisition.id),
          eq(requisitions.workflowRevision, requisition.workflowRevision),
          eq(requisitions.status, requisition.status)))
        .returning({ id: requisitions.id })
      if (changedRows.length === 0) {
        return false
      }

      await insertEvent(tx, createEvent(
        requisition.id,
        newRevision,
        'Revised',
        actor,
        requisition.status,
        RequisitionWorkflowStates.AwaitingSupervisorDecision,
        notes,
        serializeRequisitionSnapshot(
          requisition.projectId,
          requisition.materialId,
          request.costCodeId,
          request.quantity,
          request.neededByDate,
          purpose,
          notes),
        now,
        previousHash))
      return true
    })
    if (!saved) {
      return revisionConflict()
    }

    return await this.loadCommandResultAsync(actor, requisition.id)
  }

  async recordTechnicalCheckAsync(
    actorUserId: number,
    requisitionId: number,
    request: TechnicalCheckRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const actorResult = await this.requireActorAsync(actorUserId, EngineerRole)
    if (!actorResult.succeeded) {
      return failure(actorResult.errorKind, actorResult.error!)
    }

    const outcome = request.outcome?.trim()
    if (outcome !== 'Verified' && outcome !== 'RevisionRequired') {
      return failure(OperationErrorKind.Validation, 'Technical outcome must be Verified or RevisionRequired.')
    }

    const comments = InputNormalizer.optionalText(request.comments, 'Comments', 1_000)
    if (outcome === 'RevisionRequired' && comments === null) {
      return failure(OperationErrorKind.Validation, 'Explain what the foreman must revise.')
    }

    const requisition = await this.findForCommandAsync(requisitionId)
    if (requisition === null) {
      return failure(OperationErrorKind.NotFound, 'The requisition was not found.')
    }

    const accessError = await this.validateActionAccessAsync(
      actorUserId,
      requisition,
      request.expectedRevision,
      RequisitionWorkflowStates.AwaitingTechnicalCheck)
    if (accessError !== null) {
      return accessError
    }

    if (requisition.requestedByUserId === actorUserId) {
      return failure(OperationErrorKind.Forbidden, 'The requester cannot perform the technical check.')
    }

    const toStatus = outcome === 'Verified'
      ? RequisitionWorkflowStates.AwaitingSupervisorDecision
      : RequisitionWorkflowStates.ReturnedForRevision
    const now = new Date()
    const newRevision = requisition.workflowRevision + 1
    const previousHash = await this.getLatestEventHashAsync(requisition.id)
    const actor = actorResult.value!

    const saved = await this.db.transaction(async (tx) => {
      const changedRows = await updateWorkflowStateAsync(tx, requisition, toStatus, newRevision, now, null, null)
      if (changedRows === 0) {
        return false
      }

      await tx.insert(engineerTechnicalChecks).values({
        requisitionId: requisition.id,
        engineerUserId: actorUserId,
        outcome,
        comments,
        checkedAt: now,
        requisitionRevision: requisition.workflowRevision,
      })
      await insertEvent(tx, createEvent(
        requisition.id,
        newRevision,
        outcome === 'Verified' ? 'TechnicalCheckVerified' : 'TechnicalRevisionRequired',
        actor,
        requisition.status,
        toStatus,
        comments,
        serializeJson({ outcome, comments, checkedRevision: requisition.workflowRevision }),
        now,
        previousHash))
      return true
    })
    if (!saved) {
      return revisionConflict()
    }

    return await this.loadCommandResultAsync(actor, requisition.id)
  }

  async recordSupervisorDecisionAsync(
    actorUserId: number,
    requisitionId: number,
    request: SupervisorDecisionRequestDto,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const actorResult = await this.requireActorAsync(actorUserId, SupervisorRole)
    if (!actorResult.succeeded) {
      return failure(actorResult.errorKind, actorResult.error!)
    }

    const decision = request.decision?.trim()
    if (decision !== 'Approve' && decision !== 'Reject' && decision !== 'ReturnForRevision') {
      return failure(OperationErrorKind.Validation, 'Decision must be Approve, Reject, or ReturnForRevision.')
    }

    const comments = InputNormalizer.optionalText(request.comments, 'Comments', 1_000)
    if (decision !== 'Approve' && comments === null) {
      return failure(OperationErrorKind.Validation, 'A reason is required when rejecting or returning a requisition.')
    }

    const requisition = await this.findForCommandAsync(requisitionId)
    if (requisition === null) {
      return failure(OperationErrorKind.NotFound, 'The requisition was not found.')
    }

    // Legacy SiteUse rows created before the Engineer check was removed may still sit in
    // AwaitingTechnicalCheck; the Supervisor can decide them directly, so accept either status.
    const requiredStatus = requisition.status === RequisitionWorkflowStates.AwaitingTechnicalCheck
      ? RequisitionWorkflowStates.AwaitingTechnicalCheck
      : RequisitionWorkflowStates.AwaitingSupervisorDecision
    const accessError = await this.validateActionAccessAsync(
      actorUserId,
      requisition,
      request.expectedRevision,
      requiredStatus)
    if (accessError !== null) {
      return accessError
    }

    const isStockReplenishment = requisition.requestType === RequisitionTypes.StockReplenishment
    if (isStockReplenishment && decision === 'ReturnForRevision') {
      return failure(
        OperationErrorKind.Validation,
        'Approve or reject a store replenishment request. A rejected request can be raised again with corrected quantities.')
    }

    if (actorUserId === requisition.requestedByUserId) {
      return failure(OperationErrorKind.Forbidden, 'The requester and the supervisor must be different users.')
    }

    const toStatus = decision === 'Approve'
      ? RequisitionWorkflowStates.Approved
      : decision === 'Reject'
        ? RequisitionWorkflowStates.Rejected
        : RequisitionWorkflowStates.ReturnedForRevision
    const now = new Date()
    const newRevision = requisition.workflowRevision + 1
    const previousHash = await this.getLatestEventHashAsync(requisition.id)
    const finalDecision = decision === 'Approve' || decision === 'Reject'
    const actor = actorResult.value!

    const saved = await this.db.transaction(async (tx) => {
      const changedRows = await updateWorkflowStateAsync(
        tx,
        requisition,
        toStatus,
        newRevision,
        now,
        finalDecision ? actorUserId : null,
        finalDecision ? now : null)
      if (changedRows === 0) {
        return false
      }

      await insertEvent(tx, createEvent(
        requisition.id,
        newRevision,
        decision === 'Approve'
          ? 'SupervisorApproved'
          : decision === 'Reject'
            ? 'SupervisorRejected'
            : 'SupervisorReturnedForRevision',
        actor,
        requisition.status,
        toStatus,
        comments,
        serializeJson({ decision, comments, RequestType: requisition.requestType }),
        now,
        previousHash))
      return true
    })
    if (!saved) {
      return revisionConflict()
    }

    return await this.loadCommandResultAsync(actor, requisition.id)
  }

  private readScope(actor: ActorContext): (SQL | undefined)[] {
    if (actor.role === CeoRole || actor.role === AuditorRole || actor.canSwitchRoles) {
      return actor.role === ForemanRole ? [eq(requisitions.requestedByUserId, actor.userId)] : []
    }

    const conditions: (SQL | undefined)[] = [exists(this.db
      .select({ one: sql`1` })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actor.userId),
        eq(userProjectAssignments.projectId, requisitions.projectId),
        eq(userProjectAssignments.isActive, true))))]

    if (actor.role === EngineerRole) {
      conditions.push(eq(requisitions.requestType, RequisitionTypes.SiteUse))
    }

    if (actor.role === ForemanRole) {
      conditions.push(eq(requisitions.requestedByUserId, actor.userId))
    }

    return conditions
  }

  private async requireActorAsync(actorUserId: number, requiredRole: string): Promise<OperationResult<ActorContext>> {
    const actor = await this.getActorAsync(actorUserId)
    if (actor === null) {
      return failure(OperationErrorKind.Forbidden, 'The authenticated user is inactive or does not exist.')
    }

    return actor.role !== requiredRole
      ? failure(OperationErrorKind.Forbidden, `Only an active ${requiredRole} may perform this action.`)
      : OperationResult.success(actor)
  }

  private async getActorAsync(actorUserId: number): Promise<ActorContext | null> {
    const actor = await this.actorRoleResolver.resolveAsync(actorUserId)
    return actor === null
      ? null
      : { userId: actor.userId, name: actor.fullName, role: actor.effectiveRole, canSwitchRoles: actor.canSwitchRoles }
  }

  private async hasProjectAccessAsync(actorUserId: number, projectId: number): Promise<boolean> {
    const actor = await this.actorRoleResolver.resolveAsync(actorUserId)
    if (actor?.canSwitchRoles === true) {
      return true
    }

    const [assignment] = await this.db
      .select({ id: userProjectAssignments.id })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actorUserId),
        eq(userProjectAssignments.projectId, projectId),
        eq(userProjectAssignments.isActive, true)))
      .limit(1)
    return assignment !== undefined
  }

  private async isProjectOperationalAsync(projectId: number): Promise<boolean> {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.status, 'Active')))
      .limit(1)
    return project !== undefined
  }

  private async materialExistsAsync(materialId: number): Promise<boolean> {
    const [material] = await this.db
      .select({ id: materials.id })
      .from(materials)
      .where(eq(materials.id, materialId))
      .limit(1)
    return material !== undefined
  }

  private async isCostCodeActiveAsync(costCodeId: number, projectId: number): Promise<boolean> {
    const [costCode] = await this.db
      .select({ id: costCodes.id })
      .from(costCodes)
      .where(and(
        eq(costCodes.id, costCodeId),
        eq(costCodes.projectId, projectId),
        eq(costCodes.isActive, true)))
      .limit(1)
    return costCode !== undefined
  }

  private async findForCommandAsync(requisitionId: number): Promise<RequisitionRow | null> {
    const [requisition] = await this.db
      .select()
      .from(requisitions)
      .where(eq(requisitions.id, requisitionId))
      .limit(1)
    return requisition ?? null
  }

  private async validateActionAccessAsync(
    actorUserId: number,
    requisition: RequisitionRow,
    expectedRevision: number,
    requiredStatus: string,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto> | null> {
    if (!await this.hasProjectAccessAsync(actorUserId, requisition.projectId)) {
      return failure(OperationErrorKind.Forbidden, "You are not assigned to this requisition's project.")
    }

    if (!await this.isProjectOperationalAsync(requisition.projectId)) {
      return failure(OperationErrorKind.Conflict, 'Workflow actions are paused while the project is not active.')
    }

    if (requisition.status !== requiredStatus) {
      return failure(
        OperationErrorKind.Conflict,
        `This action requires status ${requiredStatus}; current status is ${requisition.status}.`)
    }

    return requisition.workflowRevision !== expectedRevision ? revisionConflict() : null
  }

  private async loadCommandResultAsync(
    actor: ActorContext,
    requisitionId: number,
  ): Promise<OperationResult<RequisitionWorkflowResponseDto>> {
    const [requisition] = await loadRequisitionsAsync(this.db, eq(requisitions.id, requisitionId), { limit: 1 })
    return requisition === undefined
      ? failure(OperationErrorKind.NotFound, 'The saved requisition could not be reloaded.')
      : OperationResult.success(toDto(requisition, actor.role, await this.loadProgressAsync(requisition, actor.role)))
  }

  private async loadProgressAsync(requisition: LoadedRequisition, actorRole: string): Promise<RequisitionProgressDto> {
    const progress = await loadRequisitionProgressAsync(this.db, [requisition], progressVisibility(actorRole))
    return progress.get(requisition.requisition.id)!
  }

  private async getLatestEventHashAsync(requisitionId: number): Promise<string | null> {
    const [latest] = await this.db
      .select({ eventHash: requisitionApprovalEvents.eventHash })
      .from(requisitionApprovalEvents)
      .where(eq(requisitionApprovalEvents.requisitionId, requisitionId))
      .orderBy(desc(requisitionApprovalEvents.sequenceNumber))
      .limit(1)
    return latest?.eventHash ?? null
  }
}

/** BaseQuery(): the requisition with project, material, cost code, users, checks and events. */
async function loadRequisitionsAsync(
  db: DbExecutor,
  filter: SQL | undefined,
  page: { orderBy?: SQL[]; offset?: number; limit?: number },
): Promise<LoadedRequisition[]> {
  let query = db
    .select({
      requisition: requisitions,
      projectName: projects.name,
      materialName: materials.name,
      materialUnit: materials.unit,
      costCode: costCodes.code,
      costCodeName: costCodes.name,
      requestedByUserName: requestedByUser.fullName,
      approvedByUserName: approvedByUser.fullName,
    })
    .from(requisitions)
    .leftJoin(projects, eq(requisitions.projectId, projects.id))
    .leftJoin(materials, eq(requisitions.materialId, materials.id))
    .leftJoin(costCodes, eq(requisitions.costCodeId, costCodes.id))
    .leftJoin(requestedByUser, eq(requisitions.requestedByUserId, requestedByUser.id))
    .leftJoin(approvedByUser, eq(requisitions.approvedByUserId, approvedByUser.id))
    .where(filter)
    .$dynamic()
  if (page.orderBy) query = query.orderBy(...page.orderBy)
  if (page.offset !== undefined) query = query.offset(page.offset)
  if (page.limit !== undefined) query = query.limit(page.limit)
  const rows = await query
  if (rows.length === 0) return []

  const ids = rows.map(row => row.requisition.id)
  const checks = await db
    .select({
      requisitionId: engineerTechnicalChecks.requisitionId,
      id: engineerTechnicalChecks.id,
      outcome: engineerTechnicalChecks.outcome,
      comments: engineerTechnicalChecks.comments,
      engineerUserId: engineerTechnicalChecks.engineerUserId,
      engineerName: users.fullName,
      checkedAt: engineerTechnicalChecks.checkedAt,
      requisitionRevision: engineerTechnicalChecks.requisitionRevision,
    })
    .from(engineerTechnicalChecks)
    .leftJoin(users, eq(engineerTechnicalChecks.engineerUserId, users.id))
    .where(inArray(engineerTechnicalChecks.requisitionId, ids))
  const events = await db
    .select({
      requisitionId: requisitionApprovalEvents.requisitionId,
      sequenceNumber: requisitionApprovalEvents.sequenceNumber,
      eventType: requisitionApprovalEvents.eventType,
      actorName: users.fullName,
      actorRole: requisitionApprovalEvents.actorRole,
      fromStatus: requisitionApprovalEvents.fromStatus,
      toStatus: requisitionApprovalEvents.toStatus,
      comments: requisitionApprovalEvents.comments,
      eventDataJson: sql<string>`${requisitionApprovalEvents.eventDataJson}::text`,
      occurredAt: requisitionApprovalEvents.occurredAt,
      eventHash: requisitionApprovalEvents.eventHash,
    })
    .from(requisitionApprovalEvents)
    .leftJoin(users, eq(requisitionApprovalEvents.actorUserId, users.id))
    .where(inArray(requisitionApprovalEvents.requisitionId, ids))
    .orderBy(asc(requisitionApprovalEvents.sequenceNumber))

  return rows.map(row => ({
    ...row,
    technicalChecks: checks.filter(check => check.requisitionId === row.requisition.id),
    approvalEvents: events.filter(event => event.requisitionId === row.requisition.id),
  }))
}

async function updateWorkflowStateAsync(
  tx: DbExecutor,
  requisition: RequisitionRow,
  toStatus: string,
  newRevision: number,
  updatedAt: Date,
  approvedByUserId: number | null,
  approvedAt: Date | null,
): Promise<number> {
  const changed = await tx
    .update(requisitions)
    .set({ status: toStatus, workflowRevision: newRevision, updatedAt, approvedByUserId, approvedAt })
    .where(and(
      eq(requisitions.id, requisition.id),
      eq(requisitions.workflowRevision, requisition.workflowRevision),
      eq(requisitions.status, requisition.status)))
    .returning({ id: requisitions.id })
  return changed.length
}

async function insertEvent(tx: DbExecutor, event: ApprovalEventInsert): Promise<void> {
  await tx.insert(requisitionApprovalEvents).values({
    ...event,
    eventDataJson: sql`${event.eventDataJson}::jsonb`,
  })
}

function createEvent(
  requisitionId: number,
  sequenceNumber: number,
  eventType: string,
  actor: ActorContext,
  fromStatus: string | null,
  toStatus: string,
  comments: string | null,
  eventDataJson: string,
  occurredAt: Date,
  previousHash: string | null,
): ApprovalEventInsert {
  const canonical = [
    String(requisitionId),
    String(sequenceNumber),
    eventType,
    String(actor.userId),
    actor.role,
    fromStatus ?? '',
    toStatus,
    toRoundTripString(occurredAt),
    comments ?? '',
    eventDataJson,
    previousHash ?? '',
  ].join('\u001f')
  const eventHash = createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase()

  return {
    requisitionId,
    sequenceNumber,
    eventType,
    actorUserId: actor.userId,
    actorRole: actor.role,
    fromStatus,
    toStatus,
    comments,
    eventDataJson,
    occurredAt,
    previousEventHash: previousHash,
    eventHash,
  }
}

function serializeRequisitionSnapshot(
  projectId: number,
  materialId: number,
  costCodeId: number,
  quantity: number,
  neededByDate: string,
  purpose: string,
  notes: string | null,
  requestType: string = RequisitionTypes.SiteUse,
): string {
  return serializeJson({ projectId, materialId, costCodeId, quantity, neededByDate, purpose, notes, requestType })
}

function validateRequestFields(
  projectId: number,
  materialId: number,
  costCodeId: number,
  quantity: number,
  neededByDate: string,
  purpose: string | null | undefined,
  notes: string | null | undefined,
): OperationResult<boolean> {
  try {
    InputNormalizer.positiveInt(projectId, 'projectId')
    InputNormalizer.positiveInt(materialId, 'materialId')
    InputNormalizer.positiveInt(costCodeId, 'costCodeId')
    InputNormalizer.positive(quantity, 'quantity', 18, 3)
    InputNormalizer.optionalText(purpose, 'purpose', 500)
    InputNormalizer.optionalText(notes, 'notes', 1_000)
  } catch (error) {
    if (error instanceof ArgumentError) {
      return failure(OperationErrorKind.Validation, error.message)
    }
    throw error
  }

  if (neededByDate === '0001-01-01') {
    return failure(OperationErrorKind.Validation, 'A needed-by date is required.')
  }

  if (neededByDate < new Date().toISOString().slice(0, 10)) {
    return failure(OperationErrorKind.Validation, 'The needed-by date cannot be in the past.')
  }

  return OperationResult.success(true)
}

function normalizeStatus(status: string | null): string | null {
  if (status === null || status.trim() === '') {
    return null
  }

  const candidate = status.trim().toUpperCase()
  return [...RequisitionWorkflowStates.All].find(allowed => allowed.toUpperCase() === candidate) ?? null
}

function canReadFullHistory(role: string): boolean {
  return role === CeoRole || role === AuditorRole
}

/** Names follow the approval-history rule; reasons follow the technical-details rule in toDto. */
function progressVisibility(role: string): ProgressVisibility {
  return {
    names: canReadFullHistory(role),
    notes: canReadFullHistory(role) || role === ForemanRole || role === EngineerRole || role === SupervisorRole,
  }
}

function toDto(
  loaded: LoadedRequisition,
  actorRole: string,
  progress: RequisitionProgressDto,
): RequisitionWorkflowResponseDto {
  const { requisition } = loaded
  const latestCheck = loaded.technicalChecks.reduce<LoadedRequisition['technicalChecks'][number] | null>(
    (latest, check) => (latest === null || check.id > latest.id ? check : latest), null)
  const includeHistory = canReadFullHistory(actorRole)
  const operationalReader = actorRole === ForemanRole || actorRole === EngineerRole || actorRole === SupervisorRole
  const includeRequester = includeHistory || operationalReader
  const includeTechnicalDetails = includeHistory || operationalReader
  const includeTechnicalIdentity = includeHistory || actorRole === EngineerRole || actorRole === SupervisorRole

  return {
    id: requisition.id,
    projectId: requisition.projectId,
    projectName: loaded.projectName ?? '',
    materialId: requisition.materialId,
    materialName: loaded.materialName ?? '',
    materialUnit: loaded.materialUnit ?? '',
    costCodeId: requisition.costCodeId,
    costCode: loaded.costCode ?? '',
    costCodeName: loaded.costCodeName ?? '',
    requestType: requisition.requestType,
    quantity: requisition.quantity,
    neededByDate: requisition.neededByDate,
    purpose: requisition.purpose,
    notes: requisition.notes,
    status: requisition.status,
    workflowRevision: requisition.workflowRevision,
    requestedByUserId: includeRequester ? requisition.requestedByUserId : null,
    requestedByUserName: includeRequester ? loaded.requestedByUserName : null,
    createdAt: requisition.createdAt,
    updatedAt: requisition.updatedAt,
    approvedAt: requisition.approvedAt,
    latestTechnicalCheck: latestCheck === null
      ? null
      : {
          id: latestCheck.id,
          outcome: latestCheck.outcome,
          comments: includeTechnicalDetails ? latestCheck.comments : null,
          engineerUserId: includeTechnicalIdentity ? latestCheck.engineerUserId : null,
          engineerName: includeTechnicalIdentity ? latestCheck.engineerName : null,
          checkedAt: latestCheck.checkedAt,
          requisitionRevision: latestCheck.requisitionRevision,
        },
    decidedByUserId: includeHistory ? requisition.approvedByUserId : null,
    decidedByUserName: includeHistory ? loaded.approvedByUserName : null,
    currentActionMessage: '',
    history: includeHistory
      ? loaded.approvalEvents.map(event => ({
          sequenceNumber: event.sequenceNumber,
          eventType: event.eventType,
          actorName: event.actorName ?? '',
          actorRole: event.actorRole,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          comments: event.comments,
          eventDataJson: event.eventDataJson,
          occurredAt: event.occurredAt,
          eventHash: event.eventHash,
        }))
      : [],
    progress,
  }
}

function failure<T>(kind: OperationErrorKind, error: string): OperationResult<T> {
  return OperationResult.failure<T>(kind, error)
}

function revisionConflict<T>(): OperationResult<T> {
  return failure(OperationErrorKind.Conflict, 'This requisition changed after you opened it. Refresh before trying again.')
}
