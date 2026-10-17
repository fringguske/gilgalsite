namespace ConstructionMS.Domain.Entities;

public sealed class SecurityAuditEvent
{
    public long Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

    public int TargetUserId { get; set; }
    public User TargetUser { get; set; } = null!;

    public int? ActorUserId { get; set; }
    public User? ActorUser { get; set; }
}

public static class SecurityAuditEventTypes
{
    public const string UsernameChanged = "UsernameChanged";
    public const string PasswordChanged = "PasswordChanged";
    public const string AdministratorPasswordReset = "AdministratorPasswordReset";
    public const string UserCreated = "UserCreated";
    public const string UserProfileUpdated = "UserProfileUpdated";
    public const string UserRoleChanged = "UserRoleChanged";
    public const string UserActivated = "UserActivated";
    public const string UserDeactivated = "UserDeactivated";
}

public static class SecurityAuditSources
{
    public const string SelfService = "SelfService";
    public const string ServerRecovery = "ServerRecovery";
    public const string Administrator = "Administrator";
}
