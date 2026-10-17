namespace ConstructionMS.Application.Services.Suppliers;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;

public interface ISupplierOnboardingService
{
    Task<SupplierOnboardingResponseDto?> GetByIdAsync(
        int requestId,
        CancellationToken cancellationToken = default);

    Task<PaginatedResult<SupplierOnboardingResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        CancellationToken cancellationToken = default);

    Task<SupplierOnboardingResponseDto> SubmitAsync(
        CreateSupplierOnboardingRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);

    Task<SupplierOnboardingResponseDto> ReviewAsync(
        int requestId,
        ReviewSupplierOnboardingRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default);
}
