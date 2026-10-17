namespace ConstructionMS.Application.Services.Auth;

/// <summary>
/// Resolves the effective role for the current request while preserving the
/// account's actual database role.
/// </summary>
public interface IActorRoleResolver
{
    Task<ActorRoleContext?> ResolveAsync(
        int userId,
        string? requestedRole = null,
        CancellationToken cancellationToken = default);
}

public sealed record ActorRoleContext(
    int UserId,
    string Username,
    string FullName,
    string Email,
    int CredentialVersion,
    string ActualRole,
    string EffectiveRole,
    bool CanSwitchRoles,
    IReadOnlyList<string> AvailableRoles);
