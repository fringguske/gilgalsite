namespace ConstructionMS.Application.Services.Auth;

using ConstructionMS.Application.DTOs.Auth;

public interface IUserProjectAssignmentService
{
    Task<IReadOnlyList<AssignedProjectDto>> GetAssignmentsAsync(int userId);
    Task<IReadOnlyList<AssignedProjectDto>> ReplaceAssignmentsAsync(
        int userId,
        IReadOnlyCollection<int> projectIds,
        int assignedByUserId);
}
