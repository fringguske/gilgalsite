namespace ConstructionMS.Application.DTOs.Tasks;

public sealed class MyTasksResponseDto
{
    public DateTime GeneratedAt { get; set; }
    public string ActualRole { get; set; } = string.Empty;
    public int TotalCount { get; set; }
    public int OverdueCount { get; set; }
    public IReadOnlyList<MyTaskResponseDto> Items { get; set; } = [];
}

public sealed class MyTaskResponseDto
{
    public string TaskKey { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Detail { get; set; } = string.Empty;
    public string RequiredRole { get; set; } = string.Empty;
    public int? ProjectId { get; set; }
    public string? ProjectName { get; set; }
    public string SourceEntityType { get; set; } = string.Empty;
    public long SourceEntityId { get; set; }
    public string TargetPath { get; set; } = string.Empty;
    public DateTime OpenedAt { get; set; }
    public DateTime DueAt { get; set; }
    public bool IsOverdue { get; set; }
    public string Priority { get; set; } = "Normal";
}

public sealed class InAppNotificationResponseDto
{
    public long Id { get; set; }
    public string TaskKey { get; set; } = string.Empty;
    public string TaskType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? ProjectId { get; set; }
    public string? ProjectName { get; set; }
    public string TargetPath { get; set; } = string.Empty;
    public DateTime TaskDueAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
}

public sealed class NotificationCountResponseDto
{
    public int UnreadCount { get; set; }
}

public sealed class NotificationReadResultDto
{
    public int MarkedReadCount { get; set; }
}
