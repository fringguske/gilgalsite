import { and, eq } from 'drizzle-orm'
import { InvalidOperationError, KeyNotFoundError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { ActorRoleContext, IActorRoleResolver } from '@/ConstructionMS.Application/Services/Auth/IActorRoleResolver'
import type { DbExecutor } from '../../Data/AppDbContext'
import { projects, userProjectAssignments } from '../../Data/schema'

/** C# `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` */
function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase()
}

export const PurchaseWorkflowAuthorization = Object.freeze({
  ChiefExecutive: 'CEO',
  Supervisor: 'Supervisor',
  ProcurementOfficer: 'Procurement Officer',
  Storekeeper: 'Storekeeper',
  FinanceOfficer: 'Finance Officer',
  Auditor: 'Auditor',

  roleEquals(actual: string, expected: string): boolean {
    return equalsIgnoreCase(actual, expected)
  },

  canViewAllProjects(role: string): boolean {
    return PurchaseWorkflowAuthorization.roleEquals(role, PurchaseWorkflowAuthorization.ChiefExecutive)
      || PurchaseWorkflowAuthorization.roleEquals(role, PurchaseWorkflowAuthorization.Auditor)
  },

  async validateActorAsync(
    _db: DbExecutor,
    actorRoleResolver: IActorRoleResolver,
    actorUserId: number,
    actorRole: string,
    ...allowedRoles: string[]
  ): Promise<ActorRoleContext> {
    if (actorUserId <= 0 || actorRole === null || actorRole === undefined || actorRole.trim() === '') {
      throw new UnauthorizedAccessError('The authenticated user identity is invalid.')
    }

    if (!allowedRoles.some(allowed => PurchaseWorkflowAuthorization.roleEquals(actorRole, allowed))) {
      throw new UnauthorizedAccessError('Your role cannot perform this purchase workflow operation.')
    }

    const actor = await actorRoleResolver.resolveAsync(actorUserId, actorRole)
    if (actor === null) {
      throw new UnauthorizedAccessError(
        'The authenticated user is inactive or their role context is no longer valid.')
    }

    return actor
  },

  async requireProjectAssignmentAsync(
    db: DbExecutor,
    actorRoleResolver: IActorRoleResolver,
    actorUserId: number,
    actorRole: string,
    projectId: number,
  ): Promise<void> {
    if (PurchaseWorkflowAuthorization.canViewAllProjects(actorRole)) {
      return
    }

    const actor = await actorRoleResolver.resolveAsync(actorUserId, actorRole)
    if (actor?.canSwitchRoles === true) {
      return
    }

    const [assigned] = await db
      .select({ id: userProjectAssignments.id })
      .from(userProjectAssignments)
      .where(and(
        eq(userProjectAssignments.userId, actorUserId),
        eq(userProjectAssignments.projectId, projectId),
        eq(userProjectAssignments.isActive, true)))
      .limit(1)

    if (!assigned) {
      throw new UnauthorizedAccessError('You are not assigned to this project.')
    }
  },

  async requireOperationalProjectAsync(db: DbExecutor, projectId: number): Promise<void> {
    const [project] = await db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!project) {
      throw new KeyNotFoundError(`Project with ID ${projectId} was not found.`)
    }

    if (project.status !== 'Active') {
      throw new InvalidOperationError(
        `Purchasing operations require an Active project. Current project status: ${project.status}.`)
    }
  },
})
