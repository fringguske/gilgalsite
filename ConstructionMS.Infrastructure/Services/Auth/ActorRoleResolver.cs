namespace ConstructionMS.Infrastructure.Services.Auth;

using ConstructionMS.Application.Configuration;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

public sealed class ActorRoleResolver : IActorRoleResolver
{
    private const string AdministratorRole = "Administrator";
    private readonly AppDbContext _db;
    private readonly ICurrentActorContext _currentActor;
    private readonly ItVerificationOptions _options;

    public ActorRoleResolver(
        AppDbContext db,
        ICurrentActorContext currentActor,
        IOptions<ItVerificationOptions> options)
    {
        _db = db;
        _currentActor = currentActor;
        _options = options.Value;
    }

    public async Task<ActorRoleContext?> ResolveAsync(
        int userId,
        string? requestedRole = null,
        CancellationToken cancellationToken = default)
    {
        if (userId <= 0)
        {
            return null;
        }

        var user = await _db.Users
            .AsNoTracking()
            .Where(candidate => candidate.Id == userId && candidate.IsActive)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Username,
                candidate.FullName,
                candidate.Email,
                candidate.CredentialVersion,
                ActualRole = candidate.Role.RoleName
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (user is null)
        {
            return null;
        }

        var effectiveRoleRequest = requestedRole;
        if (string.IsNullOrWhiteSpace(effectiveRoleRequest)
            && _currentActor.UserId == userId)
        {
            effectiveRoleRequest = _currentActor.EffectiveRole;
        }

        effectiveRoleRequest = string.IsNullOrWhiteSpace(effectiveRoleRequest)
            ? user.ActualRole
            : effectiveRoleRequest.Trim();

        var testerMatches = _options.TesterUserId is > 0
            ? user.Id == _options.TesterUserId.Value
            : !string.IsNullOrWhiteSpace(_options.TesterUsername)
                && string.Equals(
                    user.Username.Trim(),
                    _options.TesterUsername.Trim(),
                    StringComparison.OrdinalIgnoreCase);
        var isConfiguredTester = _options.Enabled
            && string.Equals(user.ActualRole, AdministratorRole, StringComparison.Ordinal)
            && testerMatches;

        IReadOnlyList<string> availableRoles = [];
        string? effectiveRole;
        if (isConfiguredTester)
        {
            availableRoles = await _db.Roles
                .AsNoTracking()
                .OrderBy(role => role.Id)
                .Select(role => role.RoleName)
                .ToListAsync(cancellationToken);
            effectiveRole = availableRoles.FirstOrDefault(role =>
                string.Equals(role, effectiveRoleRequest, StringComparison.OrdinalIgnoreCase));
        }
        else
        {
            effectiveRole = string.Equals(
                user.ActualRole,
                effectiveRoleRequest,
                StringComparison.Ordinal)
                ? user.ActualRole
                : null;
        }

        return effectiveRole is null
            ? null
            : new ActorRoleContext(
                user.Id,
                user.Username,
                user.FullName,
                user.Email,
                user.CredentialVersion,
                user.ActualRole,
                effectiveRole,
                isConfiguredTester,
                availableRoles);
    }
}
