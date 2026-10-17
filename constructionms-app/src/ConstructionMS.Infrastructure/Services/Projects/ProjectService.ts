import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { DecimalPrecision } from '@/ConstructionMS.Application/Common/DecimalPrecisionAttribute'
import {
  ArgumentError,
  ArgumentOutOfRangeError,
  InvalidOperationError,
  KeyNotFoundError,
  UnauthorizedAccessError,
} from '@/ConstructionMS.Application/Common/Exceptions'
import { dec, sum, toNumber, type Decimal } from '@/ConstructionMS.Application/Common/Money'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CostCodeResponseDto } from '@/ConstructionMS.Application/DTOs/Projects/CostCodeResponseDto'
import type { CreateCostCodeRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateCostCodeRequestDto'
import type { CreateProjectProgressVerificationRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateProjectProgressVerificationRequestDto'
import { DefaultDateOnly, type CreateProjectRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateProjectRequestDto'
import type { ProjectBudgetResponseDto } from '@/ConstructionMS.Application/DTOs/Projects/ProjectBudgetResponseDto'
import type { ProjectProgressVerificationResponseDto } from '@/ConstructionMS.Application/DTOs/Projects/ProjectProgressVerificationResponseDto'
import type { ProjectResponseDto } from '@/ConstructionMS.Application/DTOs/Projects/ProjectResponseDto'
import type { ProjectSummaryDto } from '@/ConstructionMS.Application/DTOs/Projects/ProjectSummaryDto'
import type { SetProjectBudgetRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/SetProjectBudgetRequestDto'
import type { UpdateProjectRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/UpdateProjectRequestDto'
import type { IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { IProjectService } from '@/ConstructionMS.Application/Services/Projects/IProjectService'
import { PettyCashStatuses } from '@/ConstructionMS.Domain/Entities/FinanceEntities'
import { PurchaseOrderWorkflowStates } from '@/ConstructionMS.Domain/Entities/PurchaseOrderWorkflowStates'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { compareCultureStrings } from '../../Common/StringComparison'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  costCodes,
  pettyCashRequests,
  projectBudgetAllocations,
  projectBudgets,
  projectProgressVerifications,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  requisitions,
  userProjectAssignments,
  users,
} from '../../Data/schema'
import { BudgetCommitmentGuard } from '../Finance/BudgetCommitmentGuard'

type ProjectRow = typeof projects.$inferSelect
type ProjectBudgetRow = typeof projectBudgets.$inferSelect
type ProgressRow = typeof projectProgressVerifications.$inferSelect

const CeoRole = 'CEO'
const AdministratorRole = 'Administrator'
const AuditorRole = 'Auditor'
const EngineerRole = 'Engineer'

const FinancialReadRoles: ReadonlySet<string> = new Set([CeoRole, AuditorRole, 'Supervisor', 'Finance Officer'])
const AllowedStatuses = ['Active', 'On Hold', 'Completed', 'Cancelled']

interface ActorContext {
  id: number
  fullName: string
  roleName: string
  canSwitchRoles: boolean
}

interface BudgetWithAllocations {
  budget: ProjectBudgetRow
  approvedByUserName: string | null
  allocations: { costCodeId: number; allocatedAmount: number; code: string | null; name: string | null }[]
}

/**
 * Project queries are always scoped to the current actor. Budget revisions and
 * progress verifications are append-only so the executive view is explainable.
 */
export class ProjectService implements IProjectService {
  constructor(
    private readonly db: AppDbContext,
    private readonly actorRoleResolver: IActorRoleResolver,
  ) {}

  async getAllAsync(actorUserId: number, page: number, pageSize: number): Promise<PaginatedResult<ProjectResponseDto>> {
    const actor = await this.requireActiveActorAsync(actorUserId)
    const pagination = Pagination.normalize(page, pageSize)
    const scope = this.readScope(actor)
    const [{ value: totalCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(projects)
      .where(scope)

    const entities = await this.db
      .select()
      .from(projects)
      .where(scope)
      .orderBy(asc(projects.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: entities.map(project => toDto(project, canViewFinancials(actor.roleName))),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(actorUserId: number, id: number): Promise<ProjectResponseDto | null> {
    InputNormalizer.positiveInt(id, 'id')
    const actor = await this.requireActiveActorAsync(actorUserId)
    const project = await this.findScopedProjectAsync(actor, id)

    // Returning not-found for records outside the actor's scope avoids
    // revealing that another project's record exists.
    return project === null ? null : toDto(project, canViewFinancials(actor.roleName))
  }

  async getSummaryAsync(actorUserId: number, id: number): Promise<ProjectSummaryDto | null> {
    InputNormalizer.positiveInt(id, 'id')
    const actor = await this.requireActiveActorAsync(actorUserId)
    const project = await this.findScopedProjectAsync(actor, id)
    if (project === null) {
      return null
    }

    const financials = canViewFinancials(actor.roleName)
    let currentBudget: BudgetWithAllocations | null = null
    if (financials) {
      const [latest] = await this.db
        .select()
        .from(projectBudgets)
        .where(eq(projectBudgets.projectId, id))
        .orderBy(desc(projectBudgets.createdAt), desc(projectBudgets.id))
        .limit(1)
      currentBudget = latest ? await loadBudgetAsync(this.db, latest) : null
    }

    const currentAllocations = new Map<number, number>(
      currentBudget?.allocations.map(allocation => [allocation.costCodeId, allocation.allocatedAmount]) ?? [])

    const commitmentRows = financials
      ? await this.db
        .select({
          costCodeId: requisitions.costCodeId,
          status: purchaseOrders.status,
          amount: sql<string>`${purchaseOrderLines.quantity} * ${purchaseOrderLines.unitPrice}`,
        })
        .from(purchaseOrderLines)
        .innerJoin(purchaseOrders, eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id))
        .innerJoin(requisitions, eq(purchaseOrderLines.requisitionId, requisitions.id))
        .where(and(
          eq(purchaseOrders.projectId, id),
          inArray(purchaseOrders.status, [
            PurchaseOrderWorkflowStates.Submitted,
            PurchaseOrderWorkflowStates.Approved,
            PurchaseOrderWorkflowStates.Issued,
          ])))
      : []
    const pendingCommitments = groupSum(
      commitmentRows.filter(row => row.status === PurchaseOrderWorkflowStates.Submitted))
    const approvedCommitments = groupSum(
      commitmentRows.filter(row => row.status === PurchaseOrderWorkflowStates.Approved
        || row.status === PurchaseOrderWorkflowStates.Issued))
    const pettyCashRows = financials
      ? await this.db
        .select({
          costCodeId: pettyCashRequests.costCodeId,
          amount: sql<string>`COALESCE(SUM(COALESCE(${pettyCashRequests.amountCommitted}, 0)), 0)`,
        })
        .from(pettyCashRequests)
        .where(and(
          eq(pettyCashRequests.projectId, id),
          isNotNull(pettyCashRequests.amountCommitted),
          ne(pettyCashRequests.status, PettyCashStatuses.Rejected)))
        .groupBy(pettyCashRequests.costCodeId)
      : []
    const pettyCashCommitments = new Map<number, Decimal>(
      pettyCashRows.map(row => [row.costCodeId, dec(row.amount)]))

    const costCodeRows = await this.db
      .select({
        id: costCodes.id,
        projectId: costCodes.projectId,
        code: costCodes.code,
        name: costCodes.name,
        isActive: costCodes.isActive,
      })
      .from(costCodes)
      .where(eq(costCodes.projectId, id))
      .orderBy(desc(costCodes.isActive), asc(costCodes.code))

    const costCodesWithAllocations: CostCodeResponseDto[] = costCodeRows.map(costCode => {
      const allocation = dec(currentAllocations.get(costCode.id) ?? 0)
      const pending = pendingCommitments.get(costCode.id) ?? dec(0)
      const approved = (approvedCommitments.get(costCode.id) ?? dec(0))
        .plus(pettyCashCommitments.get(costCode.id) ?? dec(0))
      return {
        id: costCode.id,
        projectId: costCode.projectId,
        code: costCode.code,
        name: costCode.name,
        isActive: costCode.isActive,
        currentAllocation: financials ? toNumber(allocation) : null,
        pendingCommitmentAmount: financials ? toNumber(pending) : null,
        approvedCommitmentAmount: financials ? toNumber(approved) : null,
        remainingAfterCommitments: financials ? toNumber(allocation.minus(approved)) : null,
      }
    })

    const [{ value: verificationCount } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(projectProgressVerifications)
      .where(eq(projectProgressVerifications.projectId, id))
    const [latestProgress] = await this.db
      .select({ verification: projectProgressVerifications, verifiedByUserName: users.fullName })
      .from(projectProgressVerifications)
      .innerJoin(users, eq(projectProgressVerifications.verifiedByUserId, users.id))
      .where(eq(projectProgressVerifications.projectId, id))
      .orderBy(desc(projectProgressVerifications.verifiedAt), desc(projectProgressVerifications.id))
      .limit(1)

    const pendingTotal = sum(pendingCommitments.values())
    const approvedTotal = sum(approvedCommitments.values())
    const pettyCashTotal = sum(pettyCashCommitments.values())
    return {
      canViewFinancials: financials,
      project: toDto(project, financials),
      currentBudget: currentBudget === null ? null : toBudgetDto(currentBudget),
      costCodes: costCodesWithAllocations,
      latestProgress: latestProgress
        ? toProgressDto(latestProgress.verification, latestProgress.verifiedByUserName)
        : null,
      progressVerificationCount: verificationCount,
      pendingCommitmentAmount: financials ? toNumber(pendingTotal) : null,
      approvedCommitmentAmount: financials ? toNumber(approvedTotal.plus(pettyCashTotal)) : null,
      remainingAfterCommitments: financials && currentBudget !== null
        ? toNumber(dec(currentBudget.budget.approvedAmount).minus(approvedTotal).minus(pettyCashTotal))
        : null,
    }
  }

  async createAsync(actorUserId: number, dto: CreateProjectRequestDto): Promise<ProjectResponseDto> {
    const actor = await this.requireRoleAsync(actorUserId, CeoRole)
    const status = normalizeStatus(dto.status)
    if (status === null) {
      throw new ArgumentError(getInvalidStatusMessage(dto.status), 'Status')
    }

    validateSchedule(dto.startDate, dto.endDate)
    const budgetAmount = InputNormalizer.nonNegative(dto.budget, 'Budget', 18, 2)
    const now = new Date()
    const name = InputNormalizer.requiredText(dto.name, 'Name', 2, 150)
    const location = InputNormalizer.optionalText(dto.location, 'Location', 300)

    const project = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({
          name,
          location,
          budget: budgetAmount,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status,
          createdAt: now,
        })
        .returning()
      await tx.insert(projectBudgets).values({
        projectId: created!.id,
        approvedAmount: budgetAmount,
        approvedByUserId: actor.id,
        approvalSource: 'CEOApproval',
        notes: 'Initial project budget',
        createdAt: now,
      })
      return created!
    })

    return toDto(project, true)
  }

  async updateAsync(
    actorUserId: number,
    id: number,
    dto: UpdateProjectRequestDto,
  ): Promise<{ dto: ProjectResponseDto | null; error: string | null }> {
    const actor = await this.requireRoleAsync(actorUserId, CeoRole)
    InputNormalizer.positiveInt(id, 'id')

    const status = normalizeStatus(dto.status)
    if (status === null) {
      return { dto: null, error: getInvalidStatusMessage(dto.status) }
    }

    if (dto.startDate === DefaultDateOnly) {
      return { dto: null, error: 'StartDate is required.' }
    }

    if (dto.endDate !== null && dto.endDate < dto.startDate) {
      return { dto: null, error: 'EndDate cannot be earlier than StartDate.' }
    }

    if (dec(dto.budget).lt(0)) {
      return { dto: null, error: 'Budget cannot be negative.' }
    }

    if (!DecimalPrecision.fits(dto.budget, 18, 2)) {
      return { dto: null, error: 'Budget must fit within 18 digits and 2 decimal places.' }
    }

    return await this.db.transaction(async (tx) => {
      await BudgetCommitmentGuard.lockProjectAsync(tx, id)
      const [project] = await tx.select().from(projects).where(eq(projects.id, id)).limit(1)
      if (!project) {
        return { dto: null, error: null }
      }

      if (!dec(project.budget).eq(dto.budget)) {
        const [previous] = await tx
          .select()
          .from(projectBudgets)
          .where(eq(projectBudgets.projectId, project.id))
          .orderBy(desc(projectBudgets.createdAt), desc(projectBudgets.id))
          .limit(1)
        const previousAllocations = previous
          ? await tx
            .select({
              costCodeId: projectBudgetAllocations.costCodeId,
              allocatedAmount: projectBudgetAllocations.allocatedAmount,
            })
            .from(projectBudgetAllocations)
            .where(eq(projectBudgetAllocations.projectBudgetId, previous.id))
          : []

        const priorAllocatedAmount = sum(previousAllocations.map(allocation => allocation.allocatedAmount))
        if (priorAllocatedAmount.gt(dto.budget)) {
          return {
            dto: null,
            error: 'The new budget is below the current cost-code allocations. ' +
              'Use the budget endpoint to submit a revised allocation split.',
          }
        }

        await BudgetCommitmentGuard.ensureRevisionCoversCommitmentsAsync(
          tx,
          project.id,
          dto.budget,
          new Map(previousAllocations.map(allocation => [allocation.costCodeId, allocation.allocatedAmount])))

        const [revision] = await tx
          .insert(projectBudgets)
          .values({
            projectId: project.id,
            approvedAmount: dto.budget,
            approvedByUserId: actor.id,
            approvalSource: 'CEOApproval',
            notes: 'Budget changed with project update',
            createdAt: new Date(),
          })
          .returning({ id: projectBudgets.id })
        if (previousAllocations.length > 0) {
          await tx.insert(projectBudgetAllocations).values(previousAllocations.map(allocation => ({
            projectBudgetId: revision!.id,
            costCodeId: allocation.costCodeId,
            allocatedAmount: allocation.allocatedAmount,
          })))
        }
      }

      const name = InputNormalizer.requiredText(dto.name, 'Name', 2, 150)
      const location = InputNormalizer.optionalText(dto.location, 'Location', 300)
      const [updated] = await tx
        .update(projects)
        .set({
          name,
          location,
          budget: dto.budget,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status,
        })
        .where(eq(projects.id, project.id))
        .returning()

      return { dto: toDto(updated!, true), error: null }
    }, { isolationLevel: IsolationLevel.ReadCommitted })
  }

  async createCostCodeAsync(
    actorUserId: number,
    projectId: number,
    dto: CreateCostCodeRequestDto,
  ): Promise<CostCodeResponseDto> {
    await this.requireRoleAsync(actorUserId, CeoRole)
    InputNormalizer.positiveInt(projectId, 'projectId')

    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!project) {
      throw new KeyNotFoundError(`Project with ID ${projectId} was not found.`)
    }

    const code = InputNormalizer.requiredText(dto.code, 'Code', 1, 30).toUpperCase()
    const name = InputNormalizer.requiredText(dto.name, 'Name', 2, 150)

    const [existing] = await this.db
      .select({ id: costCodes.id })
      .from(costCodes)
      .where(and(eq(costCodes.projectId, projectId), eq(costCodes.code, code)))
      .limit(1)
    if (existing) {
      throw new InvalidOperationError(`Cost code "${code}" already exists for this project.`)
    }

    const [costCode] = await this.db
      .insert(costCodes)
      .values({ projectId, code, name, isActive: true, createdAt: new Date() })
      .returning()

    return {
      id: costCode!.id,
      projectId: costCode!.projectId,
      code: costCode!.code,
      name: costCode!.name,
      isActive: costCode!.isActive,
      currentAllocation: 0,
      pendingCommitmentAmount: 0,
      approvedCommitmentAmount: 0,
      remainingAfterCommitments: 0,
    }
  }

  async setBudgetAsync(
    actorUserId: number,
    projectId: number,
    dto: SetProjectBudgetRequestDto,
  ): Promise<ProjectBudgetResponseDto> {
    const actor = await this.requireRoleAsync(actorUserId, CeoRole)
    InputNormalizer.positiveInt(projectId, 'projectId')
    const approvedAmount = InputNormalizer.nonNegative(dto.approvedAmount, 'ApprovedAmount', 18, 2)

    const budget = await this.db.transaction(async (tx) => {
      await BudgetCommitmentGuard.lockProjectAsync(tx, projectId)
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
      if (!project) {
        throw new KeyNotFoundError(`Project with ID ${projectId} was not found.`)
      }

      const allocationDtos = dto.allocations ?? []
      const seen = new Set<number>()
      for (const allocation of allocationDtos) {
        if (seen.has(allocation.costCodeId)) {
          throw new ArgumentError('Each cost code may appear only once in a budget revision.', 'Allocations')
        }
        seen.add(allocation.costCodeId)
      }

      for (const allocation of allocationDtos) {
        InputNormalizer.positiveInt(allocation.costCodeId, 'CostCodeId')
        InputNormalizer.nonNegative(allocation.amount, 'Amount', 18, 2)
      }

      const allocatedAmount = sum(allocationDtos.map(allocation => allocation.amount))
      if (allocatedAmount.gt(approvedAmount)) {
        throw new ArgumentError('Cost-code allocations cannot exceed the approved budget.', 'Allocations')
      }

      const costCodeIds = allocationDtos.map(allocation => allocation.costCodeId)
      const matchingCostCodes = costCodeIds.length === 0
        ? []
        : await tx
          .select({ id: costCodes.id, code: costCodes.code, name: costCodes.name })
          .from(costCodes)
          .where(and(
            inArray(costCodes.id, costCodeIds),
            eq(costCodes.projectId, projectId),
            eq(costCodes.isActive, true)))
      const costCodeById = new Map(matchingCostCodes.map(costCode => [costCode.id, costCode]))
      if (costCodeById.size !== costCodeIds.length) {
        throw new ArgumentError(
          'Every allocation must reference an active cost code belonging to this project.',
          'Allocations')
      }

      await BudgetCommitmentGuard.ensureRevisionCoversCommitmentsAsync(
        tx,
        projectId,
        approvedAmount,
        new Map(allocationDtos.map(allocation => [allocation.costCodeId, allocation.amount])))

      // Project.Budget remains a convenient current-value cache for legacy
      // callers; the ProjectBudgets table is the authoritative history.
      await tx.update(projects).set({ budget: approvedAmount }).where(eq(projects.id, projectId))
      const [created] = await tx
        .insert(projectBudgets)
        .values({
          projectId,
          approvedAmount,
          approvedByUserId: actor.id,
          approvalSource: 'CEOApproval',
          notes: InputNormalizer.optionalText(dto.notes, 'Notes', 1_000),
          createdAt: new Date(),
        })
        .returning()
      if (allocationDtos.length > 0) {
        await tx.insert(projectBudgetAllocations).values(allocationDtos.map(allocation => ({
          projectBudgetId: created!.id,
          costCodeId: allocation.costCodeId,
          allocatedAmount: allocation.amount,
        })))
      }

      return {
        budget: created!,
        approvedByUserName: actor.fullName,
        allocations: allocationDtos.map(allocation => ({
          costCodeId: allocation.costCodeId,
          allocatedAmount: allocation.amount,
          code: costCodeById.get(allocation.costCodeId)!.code,
          name: costCodeById.get(allocation.costCodeId)!.name,
        })),
      } satisfies BudgetWithAllocations
    }, { isolationLevel: IsolationLevel.ReadCommitted })

    return toBudgetDto(budget)
  }

  async addProgressVerificationAsync(
    actorUserId: number,
    projectId: number,
    dto: CreateProjectProgressVerificationRequestDto,
  ): Promise<ProjectProgressVerificationResponseDto> {
    const actor = await this.requireRoleAsync(actorUserId, EngineerRole)
    InputNormalizer.positiveInt(projectId, 'projectId')

    const [assigned] = await this.db
      .select({ id: userProjectAssignments.id })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actor.id),
        eq(userProjectAssignments.projectId, projectId),
        eq(userProjectAssignments.isActive, true),
        isNull(userProjectAssignments.endedAt)))
      .limit(1)

    if (!assigned && !actor.canSwitchRoles) {
      throw new UnauthorizedAccessError(
        'Engineers may verify progress only for projects currently assigned to them.')
    }

    const [project] = await this.db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!project) {
      throw new KeyNotFoundError(`Project with ID ${projectId} was not found.`)
    }

    if (project.status === 'Completed' || project.status === 'Cancelled') {
      throw new InvalidOperationError(
        `Progress cannot be verified while the project status is "${project.status}".`)
    }

    const percentage = InputNormalizer.nonNegative(dto.percentageComplete, 'PercentageComplete', 5, 2)
    if (dec(percentage).gt(100)) {
      throw new ArgumentOutOfRangeError('PercentageComplete', 'PercentageComplete cannot exceed 100.')
    }

    const workSummary = InputNormalizer.requiredText(dto.workSummary, 'WorkSummary', 5, 2_000)
    const evidenceReference = InputNormalizer.optionalText(dto.evidenceReference, 'EvidenceReference', 500)
    const [verification] = await this.db
      .insert(projectProgressVerifications)
      .values({
        projectId,
        percentageComplete: percentage,
        workSummary,
        evidenceReference,
        verifiedByUserId: actor.id,
        verifiedAt: new Date(),
      })
      .returning()

    return toProgressDto(verification!, actor.fullName)
  }

  private readScope(actor: ActorContext): SQL | undefined {
    if (actor.canSwitchRoles
      || actor.roleName === AdministratorRole
      || actor.roleName === CeoRole
      || actor.roleName === AuditorRole) {
      return undefined
    }

    return exists(this.db
      .select({ one: sql`1` })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actor.id),
        eq(userProjectAssignments.projectId, projects.id),
        eq(userProjectAssignments.isActive, true),
        isNull(userProjectAssignments.endedAt))))
  }

  private async findScopedProjectAsync(actor: ActorContext, id: number): Promise<ProjectRow | null> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(this.readScope(actor), eq(projects.id, id)))
      .limit(1)
    return project ?? null
  }

  private async requireActiveActorAsync(actorUserId: number): Promise<ActorContext> {
    InputNormalizer.positiveInt(actorUserId, 'actorUserId')
    const resolvedActor = await this.actorRoleResolver.resolveAsync(actorUserId)
    if (resolvedActor === null) {
      throw new UnauthorizedAccessError(
        'The signed-in user is missing, inactive, or has an invalid role context.')
    }

    const [user] = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, actorUserId), eq(users.isActive, true)))
      .limit(1)
    if (!user) {
      throw new UnauthorizedAccessError('The signed-in user is missing or inactive.')
    }

    return {
      id: user.id,
      fullName: user.fullName,
      roleName: resolvedActor.effectiveRole,
      canSwitchRoles: resolvedActor.canSwitchRoles,
    }
  }

  private async requireRoleAsync(actorUserId: number, requiredRole: string): Promise<ActorContext> {
    const actor = await this.requireActiveActorAsync(actorUserId)
    if (actor.roleName !== requiredRole) {
      throw new UnauthorizedAccessError(`This action requires the ${requiredRole} role.`)
    }

    return actor
  }
}

async function loadBudgetAsync(db: DbExecutor, budget: ProjectBudgetRow): Promise<BudgetWithAllocations> {
  const approvedBy = budget.approvedByUserId === null
    ? []
    : await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, budget.approvedByUserId)).limit(1)
  const allocations = await db
    .select({
      costCodeId: projectBudgetAllocations.costCodeId,
      allocatedAmount: projectBudgetAllocations.allocatedAmount,
      code: costCodes.code,
      name: costCodes.name,
    })
    .from(projectBudgetAllocations)
    .leftJoin(costCodes, eq(projectBudgetAllocations.costCodeId, costCodes.id))
    .where(eq(projectBudgetAllocations.projectBudgetId, budget.id))
    .orderBy(asc(projectBudgetAllocations.id))
  return { budget, approvedByUserName: approvedBy[0]?.fullName ?? null, allocations }
}

function groupSum(rows: { costCodeId: number; amount: string }[]): Map<number, Decimal> {
  const result = new Map<number, Decimal>()
  for (const row of rows) {
    result.set(row.costCodeId, (result.get(row.costCodeId) ?? dec(0)).plus(dec(row.amount)))
  }
  return result
}

function normalizeStatus(status: string | null | undefined): string | null {
  const trimmed = status?.trim()
  if (trimmed === undefined) return null
  return AllowedStatuses.find(allowed => allowed.toUpperCase() === trimmed.toUpperCase()) ?? null
}

function getInvalidStatusMessage(status: string | null | undefined): string {
  const allowed = AllowedStatuses.map(value => `"${value}"`).join(', ')
  return `Invalid status "${status ?? ''}". Allowed values: ${allowed}.`
}

function validateSchedule(startDate: string, endDate: string | null): void {
  if (startDate === DefaultDateOnly) {
    throw new ArgumentError('StartDate is required.', 'startDate')
  }

  if (endDate !== null && endDate < startDate) {
    throw new ArgumentError('EndDate cannot be earlier than StartDate.', 'endDate')
  }
}

function canViewFinancials(roleName: string): boolean {
  return FinancialReadRoles.has(roleName)
}

function toDto(project: ProjectRow, includeBudget: boolean): ProjectResponseDto {
  return {
    id: project.id,
    name: project.name,
    location: project.location,
    budget: includeBudget ? project.budget : null,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    createdAt: project.createdAt,
  }
}

function toBudgetDto({ budget, approvedByUserName, allocations }: BudgetWithAllocations): ProjectBudgetResponseDto {
  const allocatedAmount = sum(allocations.map(allocation => allocation.allocatedAmount))
  return {
    id: budget.id,
    projectId: budget.projectId,
    approvedAmount: budget.approvedAmount,
    allocatedAmount: toNumber(allocatedAmount),
    unallocatedAmount: toNumber(dec(budget.approvedAmount).minus(allocatedAmount)),
    approvedByUserId: budget.approvedByUserId,
    approvedByUserName,
    approvalSource: budget.approvalSource,
    notes: budget.notes,
    createdAt: budget.createdAt,
    allocations: [...allocations]
      .sort((a, b) => compareCultureStrings(a.code, b.code))
      .map(allocation => ({
        costCodeId: allocation.costCodeId,
        costCode: allocation.code ?? '',
        costCodeName: allocation.name ?? '',
        amount: allocation.allocatedAmount,
      })),
  }
}

function toProgressDto(verification: ProgressRow, verifiedByUserName: string | null): ProjectProgressVerificationResponseDto {
  return {
    id: verification.id,
    projectId: verification.projectId,
    percentageComplete: verification.percentageComplete,
    workSummary: verification.workSummary,
    evidenceReference: verification.evidenceReference,
    verifiedByUserId: verification.verifiedByUserId,
    verifiedByUserName: verifiedByUserName ?? '',
    verifiedAt: verification.verifiedAt,
  }
}
