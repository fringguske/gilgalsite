namespace ConstructionMS.Application.Services.PurchaseOrders;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;

public interface ISourcingService
{
    Task<PaginatedResult<SourcingRoundResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        int actorUserId,
        string actorRole,
        int? projectId = null,
        string? status = null);

    Task<SourcingRoundResponseDto?> GetByIdAsync(int id, int actorUserId, string actorRole);

    Task<SourcingRoundResponseDto> CreateAsync(
        CreateSourcingRoundRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<SupplierQuoteResponseDto> RecordQuoteAsync(
        int sourcingRoundId,
        RecordSupplierQuoteRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<SourcingRoundResponseDto> CloseAsync(
        int id, WorkflowReasonRequestDto dto, int actorUserId, string actorRole);

    Task<SourcingRoundResponseDto> CancelAsync(
        int id, WorkflowReasonRequestDto dto, int actorUserId, string actorRole);

    Task<SourcingRoundResponseDto> ReopenAsync(
        int id, ReopenSourcingRoundRequestDto dto, int actorUserId, string actorRole);
}
