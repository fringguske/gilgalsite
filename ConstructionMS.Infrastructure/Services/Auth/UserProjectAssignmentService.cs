namespace ConstructionMS.Infrastructure.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class UserProjectAssignmentService : IUserProjectAssignmentService
{
    private readonly AppDbContext _db;

    public UserProjectAssignmentService(AppDbContext db) => _db = db;

    public async Task<IReadOnlyList<AssignedProjectDto>> GetAssignmentsAsync(int userId)
    {
        if (!await _db.Users.AsNoTracking().AnyAsync(user => user.Id == userId))
        {
            throw new KeyNotFoundException($"User with ID {userId} was not found.");
        }

        return await _db.UserProjectAssignments
            .AsNoTracking()
            .Where(assignment => assignment.UserId == userId && assignment.IsActive)
            .OrderBy(assignment => assignment.ProjectId)
            .Select(assignment => new AssignedProjectDto
            {
                Id = assignment.ProjectId,
                Name = assignment.Project.Name
            })
            .ToListAsync();
    }

    public async Task<IReadOnlyList<AssignedProjectDto>> ReplaceAssignmentsAsync(
        int userId,
        IReadOnlyCollection<int> projectIds,
        int assignedByUserId)
    {
        var actorIsAdministrator = await _db.Users
            .AsNoTracking()
            .AnyAsync(user =>
                user.Id == assignedByUserId
                && user.IsActive
                && user.Role.RoleName == "Administrator");

        if (!actorIsAdministrator)
        {
            throw new UnauthorizedAccessException("Only the Administrator can change project assignments.");
        }

        if (!await _db.Users.AnyAsync(user => user.Id == userId && user.IsActive))
        {
            throw new KeyNotFoundException($"Active user with ID {userId} was not found.");
        }

        var distinctProjectIds = projectIds.Distinct().OrderBy(id => id).ToArray();
        if (distinctProjectIds.Any(id => id <= 0))
        {
            throw new ArgumentException("Project IDs must be positive.", nameof(projectIds));
        }

        var existingProjectCount = await _db.Projects
            .CountAsync(project => distinctProjectIds.Contains(project.Id));
        if (existingProjectCount != distinctProjectIds.Length)
        {
            throw new ArgumentException("One or more selected projects do not exist.", nameof(projectIds));
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();
        var assignments = await _db.UserProjectAssignments
            .Where(assignment => assignment.UserId == userId && assignment.IsActive)
            .ToListAsync();

        foreach (var assignment in assignments)
        {
            var shouldBeActive = distinctProjectIds.Contains(assignment.ProjectId);
            if (!shouldBeActive)
            {
                assignment.IsActive = false;
                assignment.EndedAt = now;
            }
        }

        var activeProjectIds = assignments
            .Where(assignment => assignment.IsActive)
            .Select(assignment => assignment.ProjectId)
            .ToHashSet();
        foreach (var projectId in distinctProjectIds.Where(id => !activeProjectIds.Contains(id)))
        {
            _db.UserProjectAssignments.Add(new UserProjectAssignment
            {
                UserId = userId,
                ProjectId = projectId,
                AssignedByUserId = assignedByUserId,
                IsActive = true,
                CreatedAt = now
            });
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await GetAssignmentsAsync(userId);
    }
}
