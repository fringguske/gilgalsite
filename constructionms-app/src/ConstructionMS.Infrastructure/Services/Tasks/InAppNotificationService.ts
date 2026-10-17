import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { ArgumentError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { InAppNotificationResponseDto } from '@/ConstructionMS.Application/DTOs/Tasks/TaskDtos'
import type { IInAppNotificationService } from '@/ConstructionMS.Application/Services/Tasks/IInAppNotificationService'
import type { IMyTasksService } from '@/ConstructionMS.Application/Services/Tasks/IMyTasksService'
import type { AppDbContext } from '../../Data/AppDbContext'
import {
  inAppNotificationReadReceipts,
  inAppNotificationResolutionReceipts,
  inAppNotifications,
  projects,
  users,
} from '../../Data/schema'
import { ticks } from './MyTasksService'

export class InAppNotificationService implements IInAppNotificationService {
  constructor(
    private readonly db: AppDbContext,
    private readonly myTasks: IMyTasksService,
  ) {}

  async getAsync(
    userId: number,
    page: number,
    pageSize: number,
    unreadOnly: boolean,
  ): Promise<PaginatedResult<InAppNotificationResponseDto>> {
    await this.requireActiveUserAsync(userId)
    const filter = and(
      eq(inAppNotifications.recipientUserId, userId),
      isNull(inAppNotificationResolutionReceipts.id),
      unreadOnly ? isNull(inAppNotificationReadReceipts.id) : undefined)

    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: total } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(inAppNotifications)
      .leftJoin(inAppNotificationResolutionReceipts,
        eq(inAppNotificationResolutionReceipts.inAppNotificationId, inAppNotifications.id))
      .leftJoin(inAppNotificationReadReceipts, eq(inAppNotificationReadReceipts.inAppNotificationId, inAppNotifications.id))
      .where(filter)
    const rows = await this.db
      .select({
        notification: inAppNotifications,
        projectName: projects.name,
        readReceiptId: inAppNotificationReadReceipts.id,
        readAt: inAppNotificationReadReceipts.readAt,
      })
      .from(inAppNotifications)
      .leftJoin(inAppNotificationResolutionReceipts,
        eq(inAppNotificationResolutionReceipts.inAppNotificationId, inAppNotifications.id))
      .leftJoin(inAppNotificationReadReceipts, eq(inAppNotificationReadReceipts.inAppNotificationId, inAppNotifications.id))
      .leftJoin(projects, eq(inAppNotifications.projectId, projects.id))
      .where(filter)
      .orderBy(desc(inAppNotifications.createdAt), desc(inAppNotifications.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: rows.map(({ notification: item, projectName, readReceiptId, readAt }) => ({
        id: item.id,
        taskKey: item.taskKey,
        taskType: item.taskType,
        title: item.title,
        message: item.message,
        projectId: item.projectId,
        projectName: item.projectId === null ? null : projectName,
        targetPath: item.targetPath,
        taskDueAt: item.taskDueAt,
        createdAt: item.createdAt,
        isRead: readReceiptId !== null,
        readAt: readReceiptId === null ? null : readAt,
      })),
      totalCount: total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getUnreadCountAsync(userId: number): Promise<number> {
    await this.requireActiveUserAsync(userId)
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(inAppNotifications)
      .leftJoin(inAppNotificationReadReceipts, eq(inAppNotificationReadReceipts.inAppNotificationId, inAppNotifications.id))
      .leftJoin(inAppNotificationResolutionReceipts,
        eq(inAppNotificationResolutionReceipts.inAppNotificationId, inAppNotifications.id))
      .where(and(
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotificationReadReceipts.id),
        isNull(inAppNotificationResolutionReceipts.id)))
    return value
  }

  async markReadAsync(notificationId: number, userId: number): Promise<boolean> {
    if (notificationId <= 0) throw new ArgumentError('Notification ID must be positive.', 'notificationId')
    await this.requireActiveUserAsync(userId)
    const [existing] = await this.db
      .select({ id: inAppNotifications.id })
      .from(inAppNotifications)
      .leftJoin(inAppNotificationResolutionReceipts,
        eq(inAppNotificationResolutionReceipts.inAppNotificationId, inAppNotifications.id))
      .where(and(
        eq(inAppNotifications.id, notificationId),
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotificationResolutionReceipts.id)))
      .limit(1)
    if (!existing) return false

    const now = new Date()
    await this.db.execute(sql`
      INSERT INTO "InAppNotificationReadReceipts"
          ("InAppNotificationId", "RecipientUserId", "ReadAt")
      SELECT notification."Id", notification."RecipientUserId", ${now.toISOString()}::timestamptz
      FROM "InAppNotifications" AS notification
      WHERE notification."Id" = ${notificationId}
        AND notification."RecipientUserId" = ${userId}
      ON CONFLICT ("InAppNotificationId") DO NOTHING`)
    return true
  }

  async markAllReadAsync(userId: number): Promise<number> {
    await this.requireActiveUserAsync(userId)
    const now = new Date()
    const inserted = await this.db.execute(sql`
      INSERT INTO "InAppNotificationReadReceipts"
          ("InAppNotificationId", "RecipientUserId", "ReadAt")
      SELECT notification."Id", notification."RecipientUserId", ${now.toISOString()}::timestamptz
      FROM "InAppNotifications" AS notification
      WHERE notification."RecipientUserId" = ${userId}
        AND NOT EXISTS (
            SELECT 1
            FROM "InAppNotificationResolutionReceipts" AS resolution
            WHERE resolution."InAppNotificationId" = notification."Id")
      ON CONFLICT ("InAppNotificationId") DO NOTHING
      RETURNING "Id"`)
    return inserted.length
  }

  async generateOverdueAsync(): Promise<number> {
    const userIds = (await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.id))).map(user => user.id)

    let inserted = 0
    for (const userId of userIds) {
      const result = await this.myTasks.getMyTasksAsync(userId, null, null, true)
      const overdueTaskStates = new Set(result.items.map(task =>
        stateKey(task.taskKey, task.openedAt, task.dueAt)))
      for (const task of result.items) {
        const idempotencyKey = `overdue:${userId}:${task.taskKey}:${ticks(task.openedAt)}:${ticks(task.dueAt)}`
        const message = task.projectName === null || task.projectName.trim() === ''
          ? task.detail
          : `${task.projectName}: ${task.detail}`
        const createdAt = new Date()
        const rows = await this.db.execute(sql`
          INSERT INTO "InAppNotifications"
              ("IdempotencyKey", "RecipientUserId", "ProjectId", "TaskKey", "TaskType",
               "Title", "Message", "TargetPath", "TaskOpenedAt", "TaskDueAt", "CreatedAt")
          VALUES
              (${idempotencyKey}, ${userId}, ${task.projectId}, ${task.taskKey}, ${task.taskType},
               ${task.title}, ${message}, ${task.targetPath}, ${task.openedAt.toISOString()}::timestamptz, ${task.dueAt.toISOString()}::timestamptz, ${createdAt.toISOString()}::timestamptz)
          ON CONFLICT ("IdempotencyKey") DO NOTHING
          RETURNING "Id"`)
        inserted += rows.length
      }

      const activeNotifications = await this.db
        .select({
          id: inAppNotifications.id,
          taskKey: inAppNotifications.taskKey,
          taskOpenedAt: inAppNotifications.taskOpenedAt,
          taskDueAt: inAppNotifications.taskDueAt,
        })
        .from(inAppNotifications)
        .leftJoin(inAppNotificationResolutionReceipts,
          eq(inAppNotificationResolutionReceipts.inAppNotificationId, inAppNotifications.id))
        .where(and(eq(inAppNotifications.recipientUserId, userId), isNull(inAppNotificationResolutionReceipts.id)))
      const resolvedAt = new Date()
      for (const stale of activeNotifications.filter(item =>
        !overdueTaskStates.has(stateKey(item.taskKey, item.taskOpenedAt, item.taskDueAt)))) {
        await this.db.execute(sql`
          INSERT INTO "InAppNotificationResolutionReceipts"
              ("InAppNotificationId", "Reason", "ResolvedAt")
          VALUES
              (${stale.id}, ${'TaskNoLongerOverdue'}, ${resolvedAt.toISOString()}::timestamptz)
          ON CONFLICT ("InAppNotificationId") DO NOTHING`)
      }
    }
    return inserted
  }

  private async requireActiveUserAsync(userId: number): Promise<void> {
    if (userId <= 0) throw new UnauthorizedAccessError('The active account could not be verified.')
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
    if (!user) throw new UnauthorizedAccessError('The active account could not be verified.')
  }
}

/** The C# value tuple `(TaskKey, OpenedAt.Ticks, DueAt.Ticks)`. */
function stateKey(taskKey: string, openedAt: Date, dueAt: Date): string {
  return `${taskKey}\u0000${ticks(openedAt)}\u0000${ticks(dueAt)}`
}
