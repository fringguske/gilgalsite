namespace ConstructionMS.Domain.Entities;

/// <summary>
/// Immutable in-app reminder generated from an overdue authoritative workflow task.
/// Its deterministic idempotency key prevents repeat scheduler runs from duplicating it.
/// </summary>
public sealed class InAppNotification
{
    public long Id { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public int RecipientUserId { get; set; }
    public User RecipientUser { get; set; } = null!;
    public int? ProjectId { get; set; }
    public Project? Project { get; set; }
    public string TaskKey { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string TargetPath { get; set; } = string.Empty;
    public DateTime TaskOpenedAt { get; set; }
    public DateTime TaskDueAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public InAppNotificationReadReceipt? ReadReceipt { get; set; }
    public InAppNotificationResolutionReceipt? ResolutionReceipt { get; set; }
}

/// <summary>Append-only evidence that the named recipient read one notification.</summary>
public sealed class InAppNotificationReadReceipt
{
    public long Id { get; set; }
    public long InAppNotificationId { get; set; }
    public InAppNotification InAppNotification { get; set; } = null!;
    public int RecipientUserId { get; set; }
    public User RecipientUser { get; set; } = null!;
    public DateTime ReadAt { get; set; }
}

/// <summary>
/// Append-only evidence that the authoritative task no longer requires attention.
/// The source notification remains immutable for audit purposes.
/// </summary>
public sealed class InAppNotificationResolutionReceipt
{
    public long Id { get; set; }
    public long InAppNotificationId { get; set; }
    public InAppNotification InAppNotification { get; set; } = null!;
    public string Reason { get; set; } = "TaskNoLongerOverdue";
    public DateTime ResolvedAt { get; set; }
}
