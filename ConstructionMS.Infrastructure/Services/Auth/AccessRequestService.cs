namespace ConstructionMS.Infrastructure.Services.Auth;

using System.Data;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class AccessRequestService(AppDbContext db) : IAccessRequestService
{
    private const int PasswordWorkFactor = 12;
    private const string NormalizedUsernameProperty = "NormalizedUsername";
    private static readonly string[] AllowedStatuses = ["Pending", "Approved", "Rejected"];

    public async Task<AccessRequestResponseDto> RegisterAsync(
        RegisterAccessRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var username = InputNormalizer.Username(request.Username, nameof(request.Username));
        var email = InputNormalizer.Email(request.Email, nameof(request.Email));
        var password = InputNormalizer.Password(request.Password, nameof(request.Password), 12, 72, 72);
        if (!string.Equals(password, request.ConfirmPassword, StringComparison.Ordinal))
        {
            throw new ArgumentException("Passwords do not match.", nameof(request.ConfirmPassword));
        }

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        await UsernameReservationLock.AcquireAsync(db, username, cancellationToken);
        if (await db.Users.AsNoTracking().AnyAsync(user =>
                EF.Property<string>(user, NormalizedUsernameProperty) == username,
                cancellationToken)
            || await db.AccessRequests.AsNoTracking().AnyAsync(candidate =>
                candidate.Status == "Pending"
                && EF.Property<string>(candidate, NormalizedUsernameProperty) == username,
                cancellationToken))
        {
            throw new InvalidOperationException("That username is already reserved.");
        }

        var accessRequest = new AccessRequest
        {
            Username = username,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, PasswordWorkFactor),
            Status = "Pending",
            RequestedAt = DateTime.UtcNow
        };
        db.AccessRequests.Add(accessRequest);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ToDto(accessRequest);
    }

    public async Task<PaginatedResult<AccessRequestResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        CancellationToken cancellationToken = default)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var normalizedStatus = string.IsNullOrWhiteSpace(status)
            ? null
            : AllowedStatuses.FirstOrDefault(candidate =>
                string.Equals(candidate, status.Trim(), StringComparison.OrdinalIgnoreCase))
                ?? throw new ArgumentException("Status must be Pending, Approved, or Rejected.", nameof(status));
        var query = db.AccessRequests
            .AsNoTracking()
            .Include(request => request.ReviewedByUser)
            .AsQueryable();
        if (normalizedStatus is not null)
        {
            query = query.Where(request => request.Status == normalizedStatus);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(request => request.RequestedAt)
            .ThenByDescending(request => request.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync(cancellationToken);
        return new PaginatedResult<AccessRequestResponseDto>
        {
            Items = items.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<AccessRequestResponseDto> ApproveAsync(
        int requestId,
        ApproveAccessRequestDto request,
        int administratorUserId,
        CancellationToken cancellationToken = default)
    {
        InputNormalizer.Positive(requestId, nameof(requestId));
        var projectIds = request.ProjectIds.Distinct().OrderBy(id => id).ToArray();
        if (projectIds.Any(id => id <= 0))
        {
            throw new ArgumentException("Project IDs must be positive.", nameof(request.ProjectIds));
        }

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        await RequireAdministratorAsync(administratorUserId, cancellationToken);
        var accessRequest = await db.AccessRequests
            .Include(candidate => candidate.ReviewedByUser)
            .SingleOrDefaultAsync(candidate => candidate.Id == requestId, cancellationToken)
            ?? throw new KeyNotFoundException("The access request was not found.");
        if (accessRequest.Status != "Pending")
        {
            throw new InvalidOperationException("This access request has already been reviewed.");
        }
        await UsernameReservationLock.AcquireAsync(
            db,
            accessRequest.Username,
            cancellationToken);

        var role = await db.Roles.SingleOrDefaultAsync(role => role.Id == request.RoleId, cancellationToken)
            ?? throw new ArgumentException("The selected role does not exist.", nameof(request.RoleId));
        if (role.RoleName == "Administrator")
        {
            throw new UnauthorizedAccessException(
                "Administrator accounts cannot be granted through public access requests.");
        }

        if (await db.Users.AnyAsync(user =>
            EF.Property<string>(user, NormalizedUsernameProperty) == accessRequest.Username,
            cancellationToken))
        {
            throw new InvalidOperationException("That username already belongs to a user account.");
        }

        var projectCount = await db.Projects.CountAsync(
            project => projectIds.Contains(project.Id),
            cancellationToken);
        if (projectCount != projectIds.Length)
        {
            throw new ArgumentException("One or more selected projects do not exist.", nameof(request.ProjectIds));
        }

        var now = DateTime.UtcNow;
        var user = new User
        {
            Username = accessRequest.Username,
            FullName = accessRequest.Username,
            Email = accessRequest.Email,
            PhoneNumber = "Not provided",
            PasswordHash = accessRequest.PasswordHash,
            RoleId = role.Id,
            IsActive = true,
            CreatedAt = now
        };
        db.Users.Add(user);
        foreach (var projectId in projectIds)
        {
            db.UserProjectAssignments.Add(new UserProjectAssignment
            {
                User = user,
                ProjectId = projectId,
                AssignedByUserId = administratorUserId,
                IsActive = true,
                CreatedAt = now
            });
        }

        accessRequest.Status = "Approved";
        accessRequest.ReviewedAt = now;
        accessRequest.ReviewedByUserId = administratorUserId;
        accessRequest.ApprovedUser = user;
        accessRequest.DecisionNote = $"Approved as {role.RoleName}";
        accessRequest.PasswordHash = "APPROVED";
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await db.Entry(accessRequest).Reference(candidate => candidate.ReviewedByUser).LoadAsync(cancellationToken);
        return ToDto(accessRequest);
    }

    public async Task<AccessRequestResponseDto> RejectAsync(
        int requestId,
        RejectAccessRequestDto request,
        int administratorUserId,
        CancellationToken cancellationToken = default)
    {
        InputNormalizer.Positive(requestId, nameof(requestId));
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        await RequireAdministratorAsync(administratorUserId, cancellationToken);
        var accessRequest = await db.AccessRequests
            .Include(candidate => candidate.ReviewedByUser)
            .SingleOrDefaultAsync(candidate => candidate.Id == requestId, cancellationToken)
            ?? throw new KeyNotFoundException("The access request was not found.");
        if (accessRequest.Status != "Pending")
        {
            throw new InvalidOperationException("This access request has already been reviewed.");
        }

        accessRequest.Status = "Rejected";
        accessRequest.ReviewedAt = DateTime.UtcNow;
        accessRequest.ReviewedByUserId = administratorUserId;
        accessRequest.DecisionNote = InputNormalizer.RequiredText(
            request.Reason,
            nameof(request.Reason),
            3,
            500);
        accessRequest.PasswordHash = "REJECTED";
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await db.Entry(accessRequest).Reference(candidate => candidate.ReviewedByUser).LoadAsync(cancellationToken);
        return ToDto(accessRequest);
    }

    private async Task RequireAdministratorAsync(int userId, CancellationToken cancellationToken)
    {
        if (!await db.Users.AsNoTracking().AnyAsync(user =>
            user.Id == userId && user.IsActive && user.Role.RoleName == "Administrator",
            cancellationToken))
        {
            throw new UnauthorizedAccessException("Only an active Administrator may review access requests.");
        }
    }

    private static AccessRequestResponseDto ToDto(AccessRequest request) => new()
    {
        Id = request.Id,
        Username = request.Username,
        Email = request.Email,
        Status = request.Status,
        RequestedAt = request.RequestedAt,
        ReviewedAt = request.ReviewedAt,
        ReviewedByName = request.ReviewedByUser?.FullName,
        ApprovedUserId = request.ApprovedUserId,
        DecisionNote = request.DecisionNote
    };
}
