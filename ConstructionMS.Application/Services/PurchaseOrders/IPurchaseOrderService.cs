namespace ConstructionMS.Application.Services.PurchaseOrders;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;

public interface IPurchaseOrderService
{
    Task<PaginatedResult<PurchaseOrderResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        int actorUserId,
        string actorRole,
        int? projectId = null,
        string? status = null);

    Task<PurchaseOrderResponseDto?> GetByIdAsync(int id, int actorUserId, string actorRole);

    Task<PurchaseOrderResponseDto> CreateAsync(
        CreatePurchaseOrderRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<PurchaseOrderResponseDto> SubmitAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<PurchaseOrderResponseDto> ApproveAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<PurchaseOrderResponseDto> IssueAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole);

    Task<PurchaseOrderResponseDto> ReturnToDraftAsync(
        int id, WorkflowReasonRequestDto dto, int actorUserId, string actorRole);

    Task<PurchaseOrderResponseDto> RejectAsync(
        int id, WorkflowReasonRequestDto dto, int actorUserId, string actorRole);

    Task<PurchaseOrderResponseDto> CorrectAsync(
        int id, CorrectPurchaseOrderRequestDto dto, int actorUserId, string actorRole);

    Task<PurchaseOrderResponseDto> CancelAsync(
        int id, WorkflowReasonRequestDto dto, int actorUserId, string actorRole);
}
