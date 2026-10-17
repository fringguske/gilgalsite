namespace ConstructionMS.Application.Services.Roles;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Roles;

/// <summary>
/// Read operations for the fixed system-role reference table.
/// </summary>
public interface IRoleService
{
    Task<PaginatedResult<RoleResponseDto>> GetAllAsync(int page, int pageSize);
    Task<RoleResponseDto?> GetByIdAsync(int id);
}
