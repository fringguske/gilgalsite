namespace ConstructionMS.Infrastructure.Services.PurchaseOrders;

using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

internal static class PurchaseWorkflowAuthorization
{
    public const string ChiefExecutive = "CEO";
    public const string Supervisor = "Supervisor";
    public const string ProcurementOfficer = "Procurement Officer";
    public const string Storekeeper = "Storekeeper";
    public const string FinanceOfficer = "Finance Officer";
    public const string Auditor = "Auditor";

    public static bool RoleEquals(string actual, string expected) =>
        string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase);

    public static bool CanViewAllProjects(string role) =>
        RoleEquals(role, ChiefExecutive) || RoleEquals(role, Auditor);

    public static async Task<ActorRoleContext> ValidateActorAsync(
        AppDbContext db,
        IActorRoleResolver actorRoleResolver,
        int actorUserId,
        string actorRole,
        params string[] allowedRoles)
    {
        if (actorUserId <= 0 || string.IsNullOrWhiteSpace(actorRole))
        {
            throw new UnauthorizedAccessException("The authenticated user identity is invalid.");
        }

        if (!allowedRoles.Any(allowed => RoleEquals(actorRole, allowed)))
        {
            throw new UnauthorizedAccessException("Your role cannot perform this purchase workflow operation.");
        }

        var actor = await actorRoleResolver.ResolveAsync(actorUserId, actorRole);
        if (actor is null)
        {
            throw new UnauthorizedAccessException(
                "The authenticated user is inactive or their role context is no longer valid.");
        }

        return actor;
    }

    public static async Task RequireProjectAssignmentAsync(
        AppDbContext db,
        IActorRoleResolver actorRoleResolver,
        int actorUserId,
        string actorRole,
        int projectId)
    {
        if (CanViewAllProjects(actorRole))
        {
            return;
        }

        var actor = await actorRoleResolver.ResolveAsync(actorUserId, actorRole);
        if (actor?.CanSwitchRoles == true)
        {
            return;
        }

        var isAssigned = await db.Set<UserProjectAssignment>()
            .AsNoTracking()
            .AnyAsync(assignment =>
                assignment.UserId == actorUserId
                && assignment.ProjectId == projectId
                && assignment.IsActive);

        if (!isAssigned)
        {
            throw new UnauthorizedAccessException("You are not assigned to this project.");
        }
    }

    public static async Task RequireOperationalProjectAsync(AppDbContext db, int projectId)
    {
        var projectStatus = await db.Projects
            .AsNoTracking()
            .Where(project => project.Id == projectId)
            .Select(project => project.Status)
            .FirstOrDefaultAsync()
            ?? throw new KeyNotFoundException($"Project with ID {projectId} was not found.");

        if (!string.Equals(projectStatus, "Active", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Purchasing operations require an Active project. Current project status: {projectStatus}.");
        }
    }
}
