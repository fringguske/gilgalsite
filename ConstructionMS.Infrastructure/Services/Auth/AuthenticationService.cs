namespace ConstructionMS.Infrastructure.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public sealed class AuthenticationService : IAuthenticationService
{
    private const string NormalizedUsernameProperty = "NormalizedUsername";
    // A valid BCrypt hash used only to keep unknown-username work comparable to
    // wrong-password work. It is not an application credential.
    private const string DummyPasswordHash =
        "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
    private readonly AppDbContext _db;
    private readonly ILogger<AuthenticationService> _logger;
    private readonly IActorRoleResolver _actorRoleResolver;

    public AuthenticationService(
        AppDbContext db,
        ILogger<AuthenticationService> logger,
        IActorRoleResolver actorRoleResolver)
    {
        _db = db;
        _logger = logger;
        _actorRoleResolver = actorRoleResolver;
    }

    public async Task<CurrentUserDto?> AuthenticateAsync(LoginRequestDto request)
    {
        var normalizedUsername = InputNormalizer.Username(request.Username, nameof(request.Username));
        var user = await _db.Users
            .Include(candidate => candidate.Role)
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate =>
                candidate.IsActive
                && EF.Property<string>(candidate, NormalizedUsernameProperty) == normalizedUsername);

        if (user is null)
        {
            BCrypt.Net.BCrypt.Verify(request.Password, DummyPasswordHash);
            return null;
        }

        try
        {
            if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return null;
            }
        }
        catch (BCrypt.Net.SaltParseException exception)
        {
            // A damaged legacy hash must fail closed without disclosing account state.
            _logger.LogError(exception, "User {UserId} has an invalid password hash.", user.Id);
            return null;
        }

        var actor = await _actorRoleResolver.ResolveAsync(user.Id, user.Role.RoleName);
        return actor is null ? null : await BuildCurrentUserAsync(actor);
    }

    public async Task<CurrentUserDto?> GetCurrentUserAsync(
        int userId,
        string? effectiveRole = null)
    {
        var actor = await _actorRoleResolver.ResolveAsync(userId, effectiveRole);
        return actor is null ? null : await BuildCurrentUserAsync(actor);
    }

    private async Task<CurrentUserDto> BuildCurrentUserAsync(ActorRoleContext actor)
    {
        var projectQuery = _db.Projects.AsNoTracking();
        if (!actor.CanSwitchRoles
            && actor.EffectiveRole is not "Administrator" and not "CEO" and not "Auditor")
        {
            projectQuery = projectQuery.Where(project =>
                _db.UserProjectAssignments.Any(assignment =>
                    assignment.UserId == actor.UserId
                    && assignment.ProjectId == project.Id
                    && assignment.IsActive));
        }

        var projects = await projectQuery
            .OrderBy(project => project.Id)
            .Select(project => new AssignedProjectDto { Id = project.Id, Name = project.Name })
            .ToListAsync();

        return new CurrentUserDto
        {
            Id = actor.UserId,
            Username = actor.Username,
            FullName = actor.FullName,
            Email = actor.Email,
            Role = actor.EffectiveRole,
            ActualRole = actor.ActualRole,
            CanSwitchRoles = actor.CanSwitchRoles,
            AvailableRoles = actor.AvailableRoles,
            Projects = projects,
            CredentialVersion = actor.CredentialVersion
        };
    }
}
