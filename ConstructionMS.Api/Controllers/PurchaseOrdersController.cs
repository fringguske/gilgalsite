namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;
using ConstructionMS.Application.Services.PurchaseOrders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

/// <summary>Prepares, independently approves and issues supplier purchase orders.</summary>
[ApiController]
[Authorize(Roles = "Procurement Officer,Supervisor,Storekeeper,Finance Officer,CEO,Auditor")]
[Route("api/v1/purchase-orders")]
[Produces("application/json")]
public sealed class PurchaseOrdersController : ControllerBase
{
    private readonly IPurchaseOrderService _purchaseOrderService;

    public PurchaseOrdersController(IPurchaseOrderService purchaseOrderService) =>
        _purchaseOrderService = purchaseOrderService;

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<PurchaseOrderResponseDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] string? status = null)
    {
        var result = await _purchaseOrderService.GetAllAsync(
            page, pageSize, User.GetRequiredUserId(), GetRequiredRole(), projectId, status);
        return Ok(ApiResponse<PaginatedResult<PurchaseOrderResponseDto>>.Ok(result));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var result = await _purchaseOrderService.GetByIdAsync(
            id, User.GetRequiredUserId(), GetRequiredRole());
        if (result is null)
        {
            return NotFound(ApiResponse<PurchaseOrderResponseDto>.Fail(
                $"Purchase order with ID {id} was not found."));
        }

        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseOrderRequestDto dto)
    {
        var result = await _purchaseOrderService.CreateAsync(
            dto, User.GetRequiredUserId(), GetRequiredRole());
        return CreatedAtAction(
            nameof(GetById),
            new { id = result.Id },
            ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/submit")]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Submit(
        int id,
        [FromBody] PurchaseOrderActionRequestDto? dto)
    {
        var result = await _purchaseOrderService.SubmitAsync(
            id,
            dto ?? new PurchaseOrderActionRequestDto(),
            User.GetRequiredUserId(),
            GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/approve")]
    [Authorize(Roles = "Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Approve(
        int id,
        [FromBody] PurchaseOrderActionRequestDto? dto)
    {
        var result = await _purchaseOrderService.ApproveAsync(
            id,
            dto ?? new PurchaseOrderActionRequestDto(),
            User.GetRequiredUserId(),
            GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/issue")]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Issue(
        int id,
        [FromBody] PurchaseOrderActionRequestDto? dto)
    {
        var result = await _purchaseOrderService.IssueAsync(
            id,
            dto ?? new PurchaseOrderActionRequestDto(),
            User.GetRequiredUserId(),
            GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/return-to-draft")]
    [Authorize(Roles = "Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ReturnToDraft(
        int id,
        [FromBody] WorkflowReasonRequestDto dto)
    {
        var result = await _purchaseOrderService.ReturnToDraftAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/reject")]
    [Authorize(Roles = "Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Reject(int id, [FromBody] WorkflowReasonRequestDto dto)
    {
        var result = await _purchaseOrderService.RejectAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPatch("{id:int}/correction")]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Correct(
        int id,
        [FromBody] CorrectPurchaseOrderRequestDto dto)
    {
        var result = await _purchaseOrderService.CorrectAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = "Procurement Officer,Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<PurchaseOrderResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Cancel(int id, [FromBody] WorkflowReasonRequestDto dto)
    {
        var result = await _purchaseOrderService.CancelAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<PurchaseOrderResponseDto>.Ok(result));
    }

    private string GetRequiredRole() =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
