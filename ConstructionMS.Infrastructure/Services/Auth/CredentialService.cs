namespace ConstructionMS.Infrastructure.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Data;

public sealed class CredentialService : ICredentialService
{
    private const int PasswordWorkFactor = 12;
    private const string NormalizedUsernameProperty = "NormalizedUsername";
    private readonly AppDbContext _db;
    private readonly ILogger<CredentialService> _logger;

    public CredentialService(AppDbContext db, ILogger<CredentialService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task ChangeUsernameAsync(
        int userId,
        ChangeUsernameRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var newUsername = InputNormalizer.Username(request.NewUsername, nameof(request.NewUsername));
        var currentPassword = InputNormalizer.Password(
            request.CurrentPassword,
            nameof(request.CurrentPassword),
            minimumLength: 1,
            maximumLength: 72,
            maximumUtf8Bytes: 72);
        var user = await _db.Users
            .SingleOrDefaultAsync(candidate => candidate.Id == userId && candidate.IsActive, cancellationToken)
            ?? throw new UnauthorizedAccessException("The authenticated account is inactive.");

        if (!CurrentPasswordMatches(user, currentPassword))
        {
            throw new UnauthorizedAccessException("The current password is incorrect.");
        }

        if (string.Equals(user.Username, newUsername, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Enter a different username.", nameof(request.NewUsername));
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        await UsernameReservationLock.AcquireAsync(_db, newUsername, cancellationToken);
        var usernameUnavailable = await _db.Users.AsNoTracking().AnyAsync(candidate =>
                candidate.Id != user.Id
                && EF.Property<string>(candidate, NormalizedUsernameProperty) == newUsername,
                cancellationToken)
            || await _db.AccessRequests.AsNoTracking().AnyAsync(candidate =>
                candidate.Status == "Pending"
                && EF.Property<string>(candidate, NormalizedUsernameProperty) == newUsername,
                cancellationToken);
        if (usernameUnavailable)
        {
            throw new InvalidOperationException("That username is already in use.");
        }

        var displayNameFollowsUsername = string.Equals(
            user.FullName.Trim(),
            user.Username,
            StringComparison.OrdinalIgnoreCase);

        user.Username = newUsername;
        if (displayNameFollowsUsername)
        {
            user.FullName = newUsername;
        }

        user.CredentialVersion = checked(user.CredentialVersion + 1);
        _db.SecurityAuditEvents.Add(new SecurityAuditEvent
        {
            EventType = SecurityAuditEventTypes.UsernameChanged,
            Source = SecurityAuditSources.SelfService,
            TargetUserId = user.Id,
            ActorUserId = user.Id,
            OccurredAt = DateTime.UtcNow
        });

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new InvalidOperationException("That username is already in use.", exception);
        }
    }

    public async Task ChangePasswordAsync(
        int userId,
        ChangePasswordRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var currentPassword = InputNormalizer.Password(
            request.CurrentPassword,
            nameof(request.CurrentPassword),
            minimumLength: 1,
            maximumLength: 72,
            maximumUtf8Bytes: 72);
        var newPassword = NormalizeNewPassword(request.NewPassword, request.ConfirmNewPassword);

        var user = await _db.Users
            .SingleOrDefaultAsync(candidate => candidate.Id == userId && candidate.IsActive, cancellationToken)
            ?? throw new UnauthorizedAccessException("The authenticated account is inactive.");

        if (!CurrentPasswordMatches(user, currentPassword))
        {
            throw new UnauthorizedAccessException("The current password is incorrect.");
        }

        if (BCrypt.Net.BCrypt.Verify(newPassword, user.PasswordHash))
        {
            throw new ArgumentException(
                "The new password must be different from the current password.",
                nameof(request.NewPassword));
        }

        await UpdatePasswordAsync(
            user,
            newPassword,
            SecurityAuditEventTypes.PasswordChanged,
            SecurityAuditSources.SelfService,
            actorUserId: user.Id,
            cancellationToken);
    }

    public async Task ResetAdministratorPasswordAsync(
        string username,
        string newPassword,
        CancellationToken cancellationToken = default)
    {
        var normalizedUsername = InputNormalizer.Username(username, nameof(username));
        var normalizedPassword = InputNormalizer.Password(
            newPassword,
            nameof(newPassword),
            minimumLength: 12,
            maximumLength: 72,
            maximumUtf8Bytes: 72);

        var user = await _db.Users
            .Include(candidate => candidate.Role)
            .SingleOrDefaultAsync(candidate =>
                candidate.IsActive
                && EF.Property<string>(candidate, NormalizedUsernameProperty) == normalizedUsername,
                cancellationToken);

        if (user is null
            || !string.Equals(user.Role.RoleName, "Administrator", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "An active Administrator with that username was not found.");
        }

        await UpdatePasswordAsync(
            user,
            normalizedPassword,
            SecurityAuditEventTypes.AdministratorPasswordReset,
            SecurityAuditSources.ServerRecovery,
            actorUserId: null,
            cancellationToken);
    }

    private async Task UpdatePasswordAsync(
        User user,
        string newPassword,
        string eventType,
        string source,
        int? actorUserId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, PasswordWorkFactor);
        user.CredentialVersion = checked(user.CredentialVersion + 1);
        _db.SecurityAuditEvents.Add(new SecurityAuditEvent
        {
            EventType = eventType,
            Source = source,
            TargetUserId = user.Id,
            ActorUserId = actorUserId,
            OccurredAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private bool CurrentPasswordMatches(User user, string currentPassword)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash);
        }
        catch (BCrypt.Net.SaltParseException exception)
        {
            _logger.LogError(exception, "User {UserId} has an invalid password hash.", user.Id);
            return false;
        }
    }

    private static string NormalizeNewPassword(string password, string confirmation)
    {
        var normalized = InputNormalizer.Password(
            password,
            nameof(password),
            minimumLength: 12,
            maximumLength: 72,
            maximumUtf8Bytes: 72);
        var normalizedConfirmation = InputNormalizer.Password(
            confirmation,
            nameof(confirmation),
            minimumLength: 12,
            maximumLength: 72,
            maximumUtf8Bytes: 72);

        if (!string.Equals(normalized, normalizedConfirmation, StringComparison.Ordinal))
        {
            throw new ArgumentException("Passwords do not match.", nameof(confirmation));
        }

        return normalized;
    }
}
