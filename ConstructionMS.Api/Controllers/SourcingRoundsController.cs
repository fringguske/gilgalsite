namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;
using ConstructionMS.Application.Services.PurchaseOrders;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

/// <summary>Captures supplier quotations for approved requisitions before a PO is prepared.</summary>
[ApiController]
[Authorize(Roles = "Procurement Officer,Supervisor,CEO,Auditor")]
[Route("api/v1/sourcing-rounds")]
[Produces("application/json")]
public sealed class SourcingRoundsController : ControllerBase
{
    private readonly ISourcingService _sourcingService;

    public SourcingRoundsController(ISourcingService sourcingService) =>
        _sourcingService = sourcingService;

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<SourcingRoundResponseDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] string? status = null)
    {
        var result = await _sourcingService.GetAllAsync(
            page, pageSize, User.GetRequiredUserId(), GetRequiredRole(), projectId, status);
        return Ok(ApiResponse<PaginatedResult<SourcingRoundResponseDto>>.Ok(result));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var result = await _sourcingService.GetByIdAsync(
            id, User.GetRequiredUserId(), GetRequiredRole());
        if (result is null)
        {
            return NotFound(ApiResponse<SourcingRoundResponseDto>.Fail(
                $"Sourcing round with ID {id} was not found."));
        }

        return Ok(ApiResponse<SourcingRoundResponseDto>.Ok(result));
    }

    [HttpPost]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateSourcingRoundRequestDto dto)
    {
        var result = await _sourcingService.CreateAsync(
            dto, User.GetRequiredUserId(), GetRequiredRole());
        return CreatedAtAction(
            nameof(GetById),
            new { id = result.Id },
            ApiResponse<SourcingRoundResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/quotes")]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<SupplierQuoteResponseDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> RecordQuote(
        int id,
        [FromBody] RecordSupplierQuoteRequestDto dto)
    {
        var result = await _sourcingService.RecordQuoteAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<SupplierQuoteResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/close")]
    [Authorize(Roles = "Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Close(int id, [FromBody] WorkflowReasonRequestDto dto)
    {
        var result = await _sourcingService.CloseAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<SourcingRoundResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/cancel")]
    [Authorize(Roles = "Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Cancel(int id, [FromBody] WorkflowReasonRequestDto dto)
    {
        var result = await _sourcingService.CancelAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<SourcingRoundResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/reopen")]
    [Authorize(Roles = "Procurement Officer,Supervisor,CEO")]
    [ProducesResponseType(typeof(ApiResponse<SourcingRoundResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Reopen(int id, [FromBody] ReopenSourcingRoundRequestDto dto)
    {
        var result = await _sourcingService.ReopenAsync(
            id, dto, User.GetRequiredUserId(), GetRequiredRole());
        return Ok(ApiResponse<SourcingRoundResponseDto>.Ok(result));
    }

    private string GetRequiredRole() =>
        User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
