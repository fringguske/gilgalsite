namespace ConstructionMS.Application.Services.Auth;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Auth;

public interface IAccessRequestService
{
    Task<AccessRequestResponseDto> RegisterAsync(
        RegisterAccessRequestDto request,
        CancellationToken cancellationToken = default);

    Task<PaginatedResult<AccessRequestResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        CancellationToken cancellationToken = default);

    Task<AccessRequestResponseDto> ApproveAsync(
        int requestId,
        ApproveAccessRequestDto request,
        int administratorUserId,
        CancellationToken cancellationToken = default);

    Task<AccessRequestResponseDto> RejectAsync(
        int requestId,
        RejectAccessRequestDto request,
        int administratorUserId,
        CancellationToken cancellationToken = default);
}
