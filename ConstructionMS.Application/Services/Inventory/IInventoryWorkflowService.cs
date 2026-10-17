namespace ConstructionMS.Application.Services.Inventory;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Inventory;

public interface IInventoryWorkflowService
{
    Task<PaginatedResult<GoodsReceiptResponseDto>> GetReceiptsAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null);
    Task<GoodsReceiptResponseDto> ReceiveGoodsAsync(ReceiveGoodsRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<TechnicalAcceptanceResponseDto>> GetTechnicalAcceptancesAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, string? status = null);
    Task<TechnicalAcceptanceResponseDto> RecordTechnicalAcceptanceAsync(
        long receiptId, RecordTechnicalAcceptanceRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<StockBalanceResponseDto>> GetBalancesAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null);
    Task<PaginatedResult<StockLedgerEntryResponseDto>> GetLedgerAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, int? materialId = null);
    Task<PaginatedResult<MaterialIssueResponseDto>> GetIssuesAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null);
    Task<MaterialIssueResponseDto> IssueMaterialAsync(IssueMaterialRequestDto request, int actorUserId, string actorRole);
    Task<MaterialIssueResponseDto> ConfirmIssueAsync(long id, ConfirmMaterialIssueRequestDto request, int actorUserId, string actorRole);
    Task<MaterialIssueResponseDto> RecordUsageAsync(long id, RecordMaterialUsageRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<StockTransferResponseDto>> GetTransfersAsync(int page, int pageSize, int actorUserId, string actorRole);
    Task<StockTransferResponseDto> CreateTransferAsync(CreateStockTransferRequestDto request, int actorUserId, string actorRole);
    Task<StockTransferResponseDto> DispatchTransferAsync(long id, int actorUserId, string actorRole);
    Task<StockTransferResponseDto> ReceiveTransferAsync(long id, ReceiveStockTransferRequestDto request, int actorUserId, string actorRole);
    Task<StockTransferResponseDto> ResolveTransferDisputeAsync(long id, ResolveStockTransferDisputeRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<StockCountResponseDto>> GetCountsAsync(int page, int pageSize, int actorUserId, string actorRole);
    Task<StockCountResponseDto> CreateCountAsync(CreateStockCountRequestDto request, int actorUserId, string actorRole);
    Task<StockCountResponseDto> ReviewCountAsync(long id, ReviewStockCountRequestDto request, int actorUserId, string actorRole);
}
