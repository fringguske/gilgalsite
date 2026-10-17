namespace ConstructionMS.Application.Services.Finance;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Finance;

public interface IPettyCashService
{
    Task<PaginatedResult<PettyCashRequestResponseDto>> GetRequestsAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, string? status = null);
    Task<PettyCashRequestResponseDto> CreateRequestAsync(CreatePettyCashRequestDto request, int actorUserId, string actorRole);
    Task<PettyCashRequestResponseDto> DecideRequestAsync(long id, DecidePettyCashRequestDto request, int actorUserId, string actorRole);
    Task<PettyCashRequestResponseDto> DisburseAsync(long id, DisbursePettyCashRequestDto request, int actorUserId, string actorRole);
    Task<PettyCashRequestResponseDto> ConfirmReceiptAsync(long id, ConfirmPettyCashReceiptDto request, int actorUserId, string actorRole);
    Task<PettyCashRequestResponseDto> SubmitReconciliationAsync(long id, SubmitPettyCashReconciliationDto request, int actorUserId, string actorRole);
    Task<PettyCashRequestResponseDto> ReviewReconciliationAsync(long id, ReviewPettyCashReconciliationDto request, int actorUserId, string actorRole);
}
