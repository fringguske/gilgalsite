namespace ConstructionMS.Application.Configuration;

/// <summary>Operational timing for the derived task inbox and its in-app reminders.</summary>
public sealed class TaskInboxOptions
{
    public const string SectionName = "TaskInbox";

    public int DefaultDueHours { get; set; } = 48;
    public int UrgentDueHours { get; set; } = 24;
    public int HandoverDueHours { get; set; } = 12;
    public int NotificationSweepMinutes { get; set; } = 5;
    public int InitialNotificationDelaySeconds { get; set; } = 30;
}
