namespace ConstructionMS.Infrastructure.Services.Tasks;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Tasks;
using ConstructionMS.Application.Services.Tasks;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class InAppNotificationService(
    AppDbContext db,
    IMyTasksService myTasks) : IInAppNotificationService
{
    public async Task<PaginatedResult<InAppNotificationResponseDto>> GetAsync(
        int userId,
        int page,
        int pageSize,
        bool unreadOnly,
        CancellationToken cancellationToken = default)
    {
        await RequireActiveUserAsync(userId, cancellationToken);
        var query = db.InAppNotifications.AsNoTracking()
            .Where(item => item.RecipientUserId == userId
                && item.ResolutionReceipt == null);
        if (unreadOnly) query = query.Where(item => item.ReadReceipt == null);

        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Include(item => item.Project)
            .Include(item => item.ReadReceipt)
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .Select(item => new InAppNotificationResponseDto
            {
                Id = item.Id,
                TaskKey = item.TaskKey,
                TaskType = item.TaskType,
                Title = item.Title,
                Message = item.Message,
                ProjectId = item.ProjectId,
                ProjectName = item.Project == null ? null : item.Project.Name,
                TargetPath = item.TargetPath,
                TaskDueAt = item.TaskDueAt,
                CreatedAt = item.CreatedAt,
                IsRead = item.ReadReceipt != null,
                ReadAt = item.ReadReceipt == null ? null : item.ReadReceipt.ReadAt
            })
            .ToListAsync(cancellationToken);

        return new PaginatedResult<InAppNotificationResponseDto>
        {
            Items = items,
            TotalCount = total,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<int> GetUnreadCountAsync(
        int userId,
        CancellationToken cancellationToken = default)
    {
        await RequireActiveUserAsync(userId, cancellationToken);
        return await db.InAppNotifications.AsNoTracking()
            .CountAsync(item => item.RecipientUserId == userId
                && item.ReadReceipt == null
                && item.ResolutionReceipt == null, cancellationToken);
    }

    public async Task<bool> MarkReadAsync(
        long notificationId,
        int userId,
        CancellationToken cancellationToken = default)
    {
        if (notificationId <= 0) throw new ArgumentException("Notification ID must be positive.", nameof(notificationId));
        await RequireActiveUserAsync(userId, cancellationToken);
        var exists = await db.InAppNotifications.AsNoTracking()
            .AnyAsync(item => item.Id == notificationId
                && item.RecipientUserId == userId
                && item.ResolutionReceipt == null, cancellationToken);
        if (!exists) return false;

        var now = DateTime.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "InAppNotificationReadReceipts"
                ("InAppNotificationId", "RecipientUserId", "ReadAt")
            SELECT notification."Id", notification."RecipientUserId", {now}
            FROM "InAppNotifications" AS notification
            WHERE notification."Id" = {notificationId}
              AND notification."RecipientUserId" = {userId}
            ON CONFLICT ("InAppNotificationId") DO NOTHING;
            """,
            cancellationToken);
        return true;
    }

    public async Task<int> MarkAllReadAsync(
        int userId,
        CancellationToken cancellationToken = default)
    {
        await RequireActiveUserAsync(userId, cancellationToken);
        var now = DateTime.UtcNow;
        return await db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            INSERT INTO "InAppNotificationReadReceipts"
                ("InAppNotificationId", "RecipientUserId", "ReadAt")
            SELECT notification."Id", notification."RecipientUserId", {now}
            FROM "InAppNotifications" AS notification
            WHERE notification."RecipientUserId" = {userId}
              AND NOT EXISTS (
                  SELECT 1
                  FROM "InAppNotificationResolutionReceipts" AS resolution
                  WHERE resolution."InAppNotificationId" = notification."Id")
            ON CONFLICT ("InAppNotificationId") DO NOTHING;
            """,
            cancellationToken);
    }

    public async Task<int> GenerateOverdueAsync(CancellationToken cancellationToken = default)
    {
        var userIds = await db.Users.AsNoTracking()
            .Where(user => user.IsActive)
            .OrderBy(user => user.Id)
            .Select(user => user.Id)
            .ToListAsync(cancellationToken);

        var inserted = 0;
        foreach (var userId in userIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await myTasks.GetMyTasksAsync(
                userId,
                requestedRole: null,
                overdueOnly: true,
                cancellationToken: cancellationToken);
            var overdueTaskStates = result.Items
                .Select(task => (task.TaskKey, task.OpenedAt.Ticks, task.DueAt.Ticks))
                .ToHashSet();
            foreach (var task in result.Items)
            {
                var idempotencyKey =
                    $"overdue:{userId}:{task.TaskKey}:{task.OpenedAt.Ticks}:{task.DueAt.Ticks}";
                var message = string.IsNullOrWhiteSpace(task.ProjectName)
                    ? task.Detail
                    : $"{task.ProjectName}: {task.Detail}";
                var createdAt = DateTime.UtcNow;
                inserted += await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO "InAppNotifications"
                        ("IdempotencyKey", "RecipientUserId", "ProjectId", "TaskKey", "TaskType",
                         "Title", "Message", "TargetPath", "TaskOpenedAt", "TaskDueAt", "CreatedAt")
                    VALUES
                        ({idempotencyKey}, {userId}, {task.ProjectId}, {task.TaskKey}, {task.TaskType},
                         {task.Title}, {message}, {task.TargetPath}, {task.OpenedAt}, {task.DueAt}, {createdAt})
                    ON CONFLICT ("IdempotencyKey") DO NOTHING;
                    """,
                    cancellationToken);
            }


            var activeNotifications = await db.InAppNotifications.AsNoTracking()
                .Where(item => item.RecipientUserId == userId
                    && item.ResolutionReceipt == null)
                .Select(item => new
                {
                    item.Id,
                    item.TaskKey,
                    item.TaskOpenedAt,
                    item.TaskDueAt
                })
                .ToListAsync(cancellationToken);
            var resolvedAt = DateTime.UtcNow;
            foreach (var stale in activeNotifications.Where(item =>
                         !overdueTaskStates.Contains(
                             (item.TaskKey, item.TaskOpenedAt.Ticks, item.TaskDueAt.Ticks))))
            {
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO "InAppNotificationResolutionReceipts"
                        ("InAppNotificationId", "Reason", "ResolvedAt")
                    VALUES
                        ({stale.Id}, {"TaskNoLongerOverdue"}, {resolvedAt})
                    ON CONFLICT ("InAppNotificationId") DO NOTHING;
                    """,
                    cancellationToken);
            }
        }
        return inserted;
    }

    private async Task RequireActiveUserAsync(int userId, CancellationToken cancellationToken)
    {
        if (userId <= 0 || !await db.Users.AsNoTracking()
                .AnyAsync(user => user.Id == userId && user.IsActive, cancellationToken))
            throw new UnauthorizedAccessException("The active account could not be verified.");
    }
}
