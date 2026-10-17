import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { ArgumentError, KeyNotFoundError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import type { AssignedProjectDto } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'
import type { IUserProjectAssignmentService } from '@/ConstructionMS.Application/Services/Auth/IUserProjectAssignmentService'
import type { AppDbContext } from '../../Data/AppDbContext'
import { projects, roles, userProjectAssignments, users } from '../../Data/schema'

export class UserProjectAssignmentService implements IUserProjectAssignmentService {
  constructor(private readonly db: AppDbContext) {}

  async getAssignmentsAsync(userId: number): Promise<AssignedProjectDto[]> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    if (!existing) {
      throw new KeyNotFoundError(`User with ID ${userId} was not found.`)
    }

    return this.db
      .select({ id: userProjectAssignments.projectId, name: projects.name })
      .from(userProjectAssignments)
      .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
      .where(and(eq(userProjectAssignments.userId, userId), eq(userProjectAssignments.isActive, true)))
      .orderBy(asc(userProjectAssignments.projectId))
  }

  async replaceAssignmentsAsync(
    userId: number,
    projectIds: readonly number[],
    assignedByUserId: number,
  ): Promise<AssignedProjectDto[]> {
    const [actor] = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, assignedByUserId), eq(users.isActive, true), eq(roles.roleName, 'Administrator')))
      .limit(1)
    if (!actor) {
      throw new UnauthorizedAccessError('Only the Administrator can change project assignments.')
    }

    const [target] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!target) {
      throw new KeyNotFoundError(`Active user with ID ${userId} was not found.`)
    }

    const distinctProjectIds = [...new Set(projectIds)].sort((a, b) => a - b)
    if (distinctProjectIds.some(id => id <= 0)) {
      throw new ArgumentError('Project IDs must be positive.', 'projectIds')
    }

    const existingProjectCount = distinctProjectIds.length === 0
      ? 0
      : (await this.db.select({ value: count() }).from(projects).where(inArray(projects.id, distinctProjectIds)))[0]?.value ?? 0
    if (existingProjectCount !== distinctProjectIds.length) {
      throw new ArgumentError('One or more selected projects do not exist.', 'projectIds')
    }

    const now = new Date()
    await this.db.transaction(async tx => {
      const assignments = await tx
        .select()
        .from(userProjectAssignments)
        .where(and(eq(userProjectAssignments.userId, userId), eq(userProjectAssignments.isActive, true)))

      const toDeactivate = assignments
        .filter(assignment => !distinctProjectIds.includes(assignment.projectId))
        .map(assignment => assignment.id)
      if (toDeactivate.length > 0) {
        await tx
          .update(userProjectAssignments)
          .set({ isActive: false, endedAt: now })
          .where(inArray(userProjectAssignments.id, toDeactivate))
      }

      const activeProjectIds = new Set(
        assignments.filter(assignment => !toDeactivate.includes(assignment.id)).map(assignment => assignment.projectId))
      const toAdd = distinctProjectIds.filter(id => !activeProjectIds.has(id))
      if (toAdd.length > 0) {
        await tx.insert(userProjectAssignments).values(toAdd.map(projectId => ({
          userId,
          projectId,
          assignedByUserId,
          isActive: true,
          createdAt: now,
        })))
      }
    })

    return this.getAssignmentsAsync(userId)
  }
}
