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
[Authorize(Roles = "Procurement Officer,Supervisor,Finance Officer,CEO,Auditor")]
[Route("api/v1/finance")]
[Produces("application/json")]
public sealed class FinanceController(IFinanceWorkflowService finance) : ControllerBase
{
    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] int? projectId = null,
        [FromQuery] string? status = null) =>
        Ok(ApiResponse<PaginatedResult<SupplierInvoiceResponseDto>>.Ok(
            await finance.GetInvoicesAsync(page, pageSize, ActorId(), Role(), projectId, status)));

    [HttpPost("invoices")]
    [Authorize(Roles = "Procurement Officer")]
    public async Task<IActionResult> CreateInvoice([FromBody] CreateSupplierInvoiceRequestDto request)
    {
        var result = await finance.CreateInvoiceAsync(request, ActorId(), Role());
        return Created($"/api/v1/finance/invoices/{result.Id}", ApiResponse<SupplierInvoiceResponseDto>.Ok(result));
    }

    [HttpPost("invoices/{id:long}/review")]
    [Authorize(Roles = "Finance Officer")]
    public async Task<IActionResult> ReviewInvoice(long id, [FromBody] ReviewInvoiceRequestDto request) =>
        Ok(ApiResponse<SupplierInvoiceResponseDto>.Ok(await finance.ReviewInvoiceAsync(id, request, ActorId(), Role())));

    [HttpPost("invoices/{id:long}/ceo-decision")]
    [Authorize(Roles = "CEO")]
    public async Task<IActionResult> CeoDecision(long id, [FromBody] CeoInvoiceDecisionRequestDto request) =>
        Ok(ApiResponse<SupplierInvoiceResponseDto>.Ok(await finance.RecordCeoDecisionAsync(id, request, ActorId(), Role())));

    [HttpPost("invoices/{id:long}/authorize")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> Authorize(long id, [FromBody] AuthorizePaymentRequestDto request) =>
        Ok(ApiResponse<SupplierInvoiceResponseDto>.Ok(await finance.AuthorizePaymentAsync(id, request, ActorId(), Role())));

    [HttpGet("authorizations")]
    [Authorize(Roles = "Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetAuthorizations(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] bool unpaidOnly = false) =>
        Ok(ApiResponse<PaginatedResult<PaymentAuthorizationResponseDto>>.Ok(
            await finance.GetAuthorizationsAsync(page, pageSize, ActorId(), Role(), unpaidOnly)));

    [HttpPost("authorizations/{id:long}/pay")]
    [Authorize(Roles = "Finance Officer")]
    public async Task<IActionResult> Pay(long id, [FromBody] ExecutePaymentRequestDto request) =>
        Ok(ApiResponse<PaymentResponseDto>.Ok(await finance.ExecutePaymentAsync(id, request, ActorId(), Role())));

    [HttpGet("payments")]
    [Authorize(Roles = "Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetPayments(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize) =>
        Ok(ApiResponse<PaginatedResult<PaymentResponseDto>>.Ok(
            await finance.GetPaymentsAsync(page, pageSize, ActorId(), Role())));

    [HttpGet("cash-book")]
    [Authorize(Roles = "CEO,Auditor")]
    public async Task<IActionResult> GetCashBook() =>
        Ok(ApiResponse<CashBookResponseDto>.Ok(
            await finance.GetCashBookAsync(ActorId(), Role())));

    [HttpGet("control-events")]
    [Authorize(Roles = "CEO,Auditor")]
    public async Task<IActionResult> GetControlEvents(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery, Range(1, int.MaxValue)] int? projectId = null,
        [FromQuery, Range(1, int.MaxValue)] int? requisitionId = null,
        [FromQuery, StringLength(80, MinimumLength = 3), RegularExpression(
            @"^[A-Z][A-Z0-9]*-[1-9][0-9]*$",
            ErrorMessage = "Chain key must use the format PREFIX-ID, for example REQ-42 or TRF-7.")]
        string? chainKey = null) =>
        Ok(ApiResponse<PaginatedResult<ControlEventResponseDto>>.Ok(
            await finance.GetControlEventsAsync(page, pageSize, ActorId(), Role(), projectId, requisitionId, chainKey)));

    private int ActorId() => User.GetRequiredUserId();
    private string Role() => User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
