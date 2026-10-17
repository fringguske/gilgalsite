namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Finance;
using ConstructionMS.Application.Services.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

[ApiController]
[Authorize(Roles = "Supervisor,Finance Officer,CEO,Auditor")]
[Route("api/v1/finance/petty-cash")]
[Produces("application/json")]
public sealed class PettyCashController(IPettyCashService pettyCash) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] string? status = null) =>
        Ok(ApiResponse<PaginatedResult<PettyCashRequestResponseDto>>.Ok(
            await pettyCash.GetRequestsAsync(page, pageSize, ActorId(), Role(), projectId, status)));

    [HttpPost]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> Create([FromBody] CreatePettyCashRequestDto request)
    {
        var result = await pettyCash.CreateRequestAsync(request, ActorId(), Role());
        return Created($"/api/v1/finance/petty-cash/{result.Id}", ApiResponse<PettyCashRequestResponseDto>.Ok(result));
    }

    [HttpPost("{id:long}/decision")]
    [Authorize(Roles = "Finance Officer")]
    public async Task<IActionResult> Decide(long id, [FromBody] DecidePettyCashRequestDto request) =>
        Ok(ApiResponse<PettyCashRequestResponseDto>.Ok(await pettyCash.DecideRequestAsync(id, request, ActorId(), Role())));

    [HttpPost("{id:long}/disburse")]
    [Authorize(Roles = "Finance Officer")]
    public async Task<IActionResult> Disburse(long id, [FromBody] DisbursePettyCashRequestDto request) =>
        Ok(ApiResponse<PettyCashRequestResponseDto>.Ok(await pettyCash.DisburseAsync(id, request, ActorId(), Role())));

    [HttpPost("{id:long}/receipt-confirmation")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> ConfirmReceipt(long id, [FromBody] ConfirmPettyCashReceiptDto request) =>
        Ok(ApiResponse<PettyCashRequestResponseDto>.Ok(await pettyCash.ConfirmReceiptAsync(id, request, ActorId(), Role())));

    [HttpPost("{id:long}/reconciliation")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> Reconcile(long id, [FromBody] SubmitPettyCashReconciliationDto request) =>
        Ok(ApiResponse<PettyCashRequestResponseDto>.Ok(await pettyCash.SubmitReconciliationAsync(id, request, ActorId(), Role())));

    [HttpPost("{id:long}/reconciliation-decision")]
    [Authorize(Roles = "Finance Officer")]
    public async Task<IActionResult> ReviewReconciliation(long id, [FromBody] ReviewPettyCashReconciliationDto request) =>
        Ok(ApiResponse<PettyCashRequestResponseDto>.Ok(await pettyCash.ReviewReconciliationAsync(id, request, ActorId(), Role())));

    private int ActorId() => User.GetRequiredUserId();
    private string Role() => User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
