namespace ConstructionMS.Infrastructure.Services.Users;

using System.Data;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Users;
using ConstructionMS.Application.Services.Users;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using ConstructionMS.Infrastructure.Services.Auth;
using Microsoft.EntityFrameworkCore;

/// <summary>Persists users and hashes passwords with BCrypt.</summary>
public class UserService : IUserService
{
    private const int PasswordWorkFactor = 12;
    private const string NormalizedUsernameProperty = "NormalizedUsername";
    private readonly AppDbContext _db;

    public UserService(AppDbContext db) => _db = db;

    public async Task<PaginatedResult<UserResponseDto>> GetAllAsync(int page, int pageSize)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var query = _db.Users
            .Include(u => u.Role)
            .AsNoTracking();

        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderBy(u => u.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<UserResponseDto>
        {
            Items = entities.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<UserResponseDto?> GetByIdAsync(int id)
    {
        var user = await _db.Users
            .Include(u => u.Role)
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == id);

        return user is null ? null : ToDto(user);
    }

    public async Task<UserResponseDto> CreateAsync(
        CreateUserRequestDto dto,
        int? administratorUserId = null)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable);
        if (administratorUserId.HasValue)
        {
            await RequireAdministratorAsync(administratorUserId.Value);
        }

        var email = InputNormalizer.Email(dto.Email, nameof(dto.Email));
        var username = InputNormalizer.Username(dto.Username, nameof(dto.Username));
        await UsernameReservationLock.AcquireAsync(_db, username);

        if (await _db.Users.AnyAsync(user =>
                EF.Property<string>(user, NormalizedUsernameProperty) == username)
            || await _db.AccessRequests.AnyAsync(request =>
                request.Status == "Pending"
                && EF.Property<string>(request, NormalizedUsernameProperty) == username))
        {
            throw new InvalidOperationException("A user with that username already exists.");
        }

        if (!await _db.Roles.AnyAsync(role => role.Id == dto.RoleId))
        {
            throw new ArgumentException("The selected role does not exist.", nameof(dto.RoleId));
        }

        var user = new User
        {
            Username = username,
            FullName = InputNormalizer.RequiredText(dto.FullName, nameof(dto.FullName), 2, 150),
            Email = email,
            PhoneNumber = InputNormalizer.RequiredText(
                dto.PhoneNumber,
                nameof(dto.PhoneNumber),
                maximumLength: 30),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(
                InputNormalizer.Password(dto.Password, nameof(dto.Password), 12, 72, 72),
                workFactor: PasswordWorkFactor),
            RoleId = dto.RoleId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        if (administratorUserId.HasValue)
        {
            _db.SecurityAuditEvents.Add(NewAdministratorAuditEvent(
                SecurityAuditEventTypes.UserCreated,
                user,
                administratorUserId.Value));
        }
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        await _db.Entry(user).Reference(u => u.Role).LoadAsync();

        return ToDto(user);
    }

    public async Task<UserResponseDto?> UpdateAsync(
        int id,
        UpdateUserRequestDto dto,
        int administratorUserId)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable);
        await RequireAdministratorAsync(administratorUserId);
        var user = await _db.Users.FindAsync(id);

        if (user is null) return null;

        var email = InputNormalizer.Email(dto.Email, nameof(dto.Email));
        var username = InputNormalizer.Username(dto.Username, nameof(dto.Username));
        await UsernameReservationLock.AcquireAsync(_db, username);

        if (await _db.Users.AnyAsync(existing =>
                existing.Id != id
                && EF.Property<string>(existing, NormalizedUsernameProperty) == username)
            || await _db.AccessRequests.AnyAsync(request =>
                request.Status == "Pending"
                && request.ApprovedUserId != id
                && EF.Property<string>(request, NormalizedUsernameProperty) == username))
        {
            throw new InvalidOperationException("A user with that username already exists.");
        }

        if (!await _db.Roles.AnyAsync(role => role.Id == dto.RoleId))
        {
            throw new ArgumentException("The selected role does not exist.", nameof(dto.RoleId));
        }

        var roleChanged = user.RoleId != dto.RoleId;
        if (roleChanged)
        {
            var currentRole = await _db.Roles
                .Where(role => role.Id == user.RoleId)
                .Select(role => role.RoleName)
                .SingleAsync();
            var nextRole = await _db.Roles
                .Where(role => role.Id == dto.RoleId)
                .Select(role => role.RoleName)
                .SingleAsync();
            if (currentRole is "CEO" or "Administrator"
                && nextRole != currentRole
                && user.IsActive
                && await CountActiveUsersInRoleAsync(currentRole) <= 1)
            {
                throw new InvalidOperationException(
                    $"The final active {currentRole} cannot be moved to another role.");
            }
        }

        var fullName = InputNormalizer.RequiredText(dto.FullName, nameof(dto.FullName), 2, 150);
        var phoneNumber = InputNormalizer.RequiredText(
            dto.PhoneNumber,
            nameof(dto.PhoneNumber),
            maximumLength: 30);
        var profileChanged = user.FullName != fullName
            || user.Username != username
            || user.Email != email
            || user.PhoneNumber != phoneNumber;

        user.FullName = fullName;
        user.Username = username;
        user.Email = email;
        user.PhoneNumber = phoneNumber;
        user.RoleId = dto.RoleId;

        if (profileChanged)
        {
            _db.SecurityAuditEvents.Add(NewAdministratorAuditEvent(
                SecurityAuditEventTypes.UserProfileUpdated,
                user,
                administratorUserId));
        }
        if (roleChanged)
        {
            _db.SecurityAuditEvents.Add(NewAdministratorAuditEvent(
                SecurityAuditEventTypes.UserRoleChanged,
                user,
                administratorUserId));
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return await GetByIdAsync(id)
            ?? throw new InvalidOperationException("User was saved but could not be retrieved.");
    }

    public async Task<bool> SetActiveStatusAsync(
        int id,
        bool isActive,
        int administratorUserId)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable);
        await RequireAdministratorAsync(administratorUserId);
        var user = await _db.Users.FindAsync(id);
        if (user is null) return false;

        if (!isActive && user.IsActive)
        {
            var protectedRole = await _db.Roles
                .Where(role => role.Id == user.RoleId
                    && (role.RoleName == "CEO" || role.RoleName == "Administrator"))
                .Select(role => role.RoleName)
                .SingleOrDefaultAsync();
            if (protectedRole is not null
                && await CountActiveUsersInRoleAsync(protectedRole) <= 1)
            {
                throw new InvalidOperationException(
                    $"The final active {protectedRole} cannot be deactivated.");
            }
        }

        if (user.IsActive == isActive)
        {
            await transaction.CommitAsync();
            return true;
        }

        user.IsActive = isActive;
        _db.SecurityAuditEvents.Add(NewAdministratorAuditEvent(
            isActive
                ? SecurityAuditEventTypes.UserActivated
                : SecurityAuditEventTypes.UserDeactivated,
            user,
            administratorUserId));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return true;
    }

    private async Task RequireAdministratorAsync(int userId)
    {
        if (!await _db.Users.AsNoTracking().AnyAsync(user =>
            user.Id == userId
            && user.IsActive
            && user.Role.RoleName == "Administrator"))
        {
            throw new UnauthorizedAccessException("Only an active Administrator may manage users.");
        }
    }

    private static SecurityAuditEvent NewAdministratorAuditEvent(
        string eventType,
        User targetUser,
        int administratorUserId) => new()
        {
            EventType = eventType,
            Source = SecurityAuditSources.Administrator,
            TargetUser = targetUser,
            ActorUserId = administratorUserId,
            OccurredAt = DateTime.UtcNow
        };

    private Task<int> CountActiveUsersInRoleAsync(string roleName) =>
        _db.Users.CountAsync(candidate =>
            candidate.IsActive && candidate.Role.RoleName == roleName);

    private static UserResponseDto ToDto(User u) => new()
    {
        Id = u.Id,
        Username = u.Username,
        FullName = u.FullName,
        Email = u.Email,
        PhoneNumber = u.PhoneNumber,
        IsActive = u.IsActive,
        CreatedAt = u.CreatedAt,
        RoleId = u.RoleId,
        RoleName = u.Role?.RoleName ?? string.Empty
    };
}
