namespace ConstructionMS.Application.Services.Projects;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Projects;

/// <summary>Business operations for construction projects.</summary>
public interface IProjectService
{
    Task<PaginatedResult<ProjectResponseDto>> GetAllAsync(
        int actorUserId,
        int page,
        int pageSize);

    Task<ProjectResponseDto?> GetByIdAsync(int actorUserId, int id);
    Task<ProjectSummaryDto?> GetSummaryAsync(int actorUserId, int id);
    Task<ProjectResponseDto> CreateAsync(int actorUserId, CreateProjectRequestDto dto);

    /// <summary>
    /// Updates project details. Returns null if not found.
    /// Returns an error string if the Status value is invalid.
    /// </summary>
    Task<(ProjectResponseDto? dto, string? error)> UpdateAsync(
        int actorUserId,
        int id,
        UpdateProjectRequestDto dto);

    Task<CostCodeResponseDto> CreateCostCodeAsync(
        int actorUserId,
        int projectId,
        CreateCostCodeRequestDto dto);

    Task<ProjectBudgetResponseDto> SetBudgetAsync(
        int actorUserId,
        int projectId,
        SetProjectBudgetRequestDto dto);

    Task<ProjectProgressVerificationResponseDto> AddProgressVerificationAsync(
        int actorUserId,
        int projectId,
        CreateProjectProgressVerificationRequestDto dto);
}
