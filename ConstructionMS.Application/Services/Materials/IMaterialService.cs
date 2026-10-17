namespace ConstructionMS.Application.Services.Materials;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;

/// <summary>Business operations for the material catalogue.</summary>
public interface IMaterialService
{
    Task<PaginatedResult<MaterialResponseDto>> GetAllAsync(int page, int pageSize);
    Task<MaterialResponseDto?> GetByIdAsync(int id);
    Task<MaterialResponseDto> CreateAsync(CreateMaterialRequestDto dto);
    Task<MaterialResponseDto?> UpdateAsync(int id, UpdateMaterialRequestDto dto);
    Task<MaterialResponseDto?> SetTechnicalAcceptancePolicyAsync(int id, bool required, int actorUserId);
}
