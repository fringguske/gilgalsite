namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Inventory;
using ConstructionMS.Application.Services.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

[ApiController]
[Authorize(Roles = "Storekeeper,Foreman,Supervisor,Engineer,Procurement Officer,Finance Officer,CEO,Auditor")]
[Route("api/v1/inventory")]
[Produces("application/json")]
public sealed class InventoryController(IInventoryWorkflowService inventory) : ControllerBase
{
    [HttpGet("receipts")]
    [Authorize(Roles = "Storekeeper,Procurement Officer,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetReceipts(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null) =>
        Ok(ApiResponse<PaginatedResult<GoodsReceiptResponseDto>>.Ok(
            await inventory.GetReceiptsAsync(page, pageSize, ActorId(), Role(), projectId)));

    [HttpPost("receipts")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> Receive([FromBody] ReceiveGoodsRequestDto request)
    {
        var result = await inventory.ReceiveGoodsAsync(request, ActorId(), Role());
        return Created($"/api/v1/inventory/receipts/{result.Id}", ApiResponse<GoodsReceiptResponseDto>.Ok(result));
    }

    [HttpGet("technical-acceptances")]
    [Authorize(Roles = "Engineer,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetTechnicalAcceptances(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] string? status = null) =>
        Ok(ApiResponse<PaginatedResult<TechnicalAcceptanceResponseDto>>.Ok(
            await inventory.GetTechnicalAcceptancesAsync(
                page, pageSize, ActorId(), Role(), projectId, status)));

    [HttpPost("receipts/{receiptId:long}/technical-acceptance")]
    [Authorize(Roles = "Engineer")]
    public async Task<IActionResult> RecordTechnicalAcceptance(
        long receiptId,
        [FromBody] RecordTechnicalAcceptanceRequestDto request) =>
        Ok(ApiResponse<TechnicalAcceptanceResponseDto>.Ok(
            await inventory.RecordTechnicalAcceptanceAsync(
                receiptId, request, ActorId(), Role())));

    [HttpGet("balances")]
    [Authorize(Roles = "Storekeeper,Foreman,Supervisor,Engineer,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetBalances(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null) =>
        Ok(ApiResponse<PaginatedResult<StockBalanceResponseDto>>.Ok(
            await inventory.GetBalancesAsync(page, pageSize, ActorId(), Role(), projectId)));

    [HttpGet("ledger")]
    [Authorize(Roles = "Storekeeper,Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetLedger(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] int? materialId = null) =>
        Ok(ApiResponse<PaginatedResult<StockLedgerEntryResponseDto>>.Ok(
            await inventory.GetLedgerAsync(page, pageSize, ActorId(), Role(), projectId, materialId)));

    [HttpGet("issues")]
    [Authorize(Roles = "Storekeeper,Foreman,Supervisor,Engineer,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetIssues(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null) =>
        Ok(ApiResponse<PaginatedResult<MaterialIssueResponseDto>>.Ok(
            await inventory.GetIssuesAsync(page, pageSize, ActorId(), Role(), projectId)));

    [HttpPost("issues")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> Issue([FromBody] IssueMaterialRequestDto request)
    {
        var result = await inventory.IssueMaterialAsync(request, ActorId(), Role());
        return Created($"/api/v1/inventory/issues/{result.Id}", ApiResponse<MaterialIssueResponseDto>.Ok(result));
    }

    [HttpPost("issues/{id:long}/confirm")]
    [Authorize(Roles = "Foreman")]
    public async Task<IActionResult> Confirm(long id, [FromBody] ConfirmMaterialIssueRequestDto request) =>
        Ok(ApiResponse<MaterialIssueResponseDto>.Ok(await inventory.ConfirmIssueAsync(id, request, ActorId(), Role())));

    [HttpPost("issues/{id:long}/usage")]
    [Authorize(Roles = "Foreman")]
    public async Task<IActionResult> RecordUsage(long id, [FromBody] RecordMaterialUsageRequestDto request) =>
        Ok(ApiResponse<MaterialIssueResponseDto>.Ok(await inventory.RecordUsageAsync(id, request, ActorId(), Role())));

    [HttpGet("transfers")]
    [Authorize(Roles = "Storekeeper,Supervisor,CEO,Auditor")]
    public async Task<IActionResult> GetTransfers(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize) =>
        Ok(ApiResponse<PaginatedResult<StockTransferResponseDto>>.Ok(
            await inventory.GetTransfersAsync(page, pageSize, ActorId(), Role())));

    [HttpPost("transfers")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> CreateTransfer([FromBody] CreateStockTransferRequestDto request)
    {
        var result = await inventory.CreateTransferAsync(request, ActorId(), Role());
        return Created($"/api/v1/inventory/transfers/{result.Id}", ApiResponse<StockTransferResponseDto>.Ok(result));
    }

    [HttpPost("transfers/{id:long}/dispatch")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> DispatchTransfer(long id) =>
        Ok(ApiResponse<StockTransferResponseDto>.Ok(await inventory.DispatchTransferAsync(id, ActorId(), Role())));

    [HttpPost("transfers/{id:long}/receive")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> ReceiveTransfer(long id, [FromBody] ReceiveStockTransferRequestDto request) =>
        Ok(ApiResponse<StockTransferResponseDto>.Ok(await inventory.ReceiveTransferAsync(id, request, ActorId(), Role())));

    [HttpPost("transfers/{id:long}/resolve")]
    [Authorize(Roles = "CEO")]
    public async Task<IActionResult> ResolveTransferDispute(
        long id,
        [FromBody] ResolveStockTransferDisputeRequestDto request) =>
        Ok(ApiResponse<StockTransferResponseDto>.Ok(
            await inventory.ResolveTransferDisputeAsync(id, request, ActorId(), Role())));

    [HttpGet("counts")]
    [Authorize(Roles = "Storekeeper,Supervisor,CEO,Auditor")]
    public async Task<IActionResult> GetCounts(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize) =>
        Ok(ApiResponse<PaginatedResult<StockCountResponseDto>>.Ok(
            await inventory.GetCountsAsync(page, pageSize, ActorId(), Role())));

    [HttpPost("counts")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> CreateCount([FromBody] CreateStockCountRequestDto request)
    {
        var result = await inventory.CreateCountAsync(request, ActorId(), Role());
        return Created($"/api/v1/inventory/counts/{result.Id}", ApiResponse<StockCountResponseDto>.Ok(result));
    }

    [HttpPost("counts/{id:long}/review")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> ReviewCount(long id, [FromBody] ReviewStockCountRequestDto request) =>
        Ok(ApiResponse<StockCountResponseDto>.Ok(await inventory.ReviewCountAsync(id, request, ActorId(), Role())));

    private int ActorId() => User.GetRequiredUserId();
    private string Role() => User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
