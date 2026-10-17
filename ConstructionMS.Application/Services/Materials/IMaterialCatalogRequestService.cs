namespace ConstructionMS.Application.Services.Materials;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;

public interface IMaterialCatalogRequestService
{
    Task<PaginatedResult<MaterialCatalogRequestResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);

    Task<MaterialCatalogRequestResponseDto> SubmitAsync(
        CreateMaterialCatalogRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);

    Task<MaterialCatalogRequestResponseDto> ReviewAsync(
        int requestId,
        ReviewMaterialCatalogRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);
}
