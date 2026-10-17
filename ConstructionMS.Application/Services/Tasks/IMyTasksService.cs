namespace ConstructionMS.Application.Services.Tasks;

using ConstructionMS.Application.DTOs.Tasks;

public interface IMyTasksService
{
    Task<MyTasksResponseDto> GetMyTasksAsync(
        int userId,
        string? requestedRole = null,
        int? projectId = null,
        bool overdueOnly = false,
        CancellationToken cancellationToken = default);
}
