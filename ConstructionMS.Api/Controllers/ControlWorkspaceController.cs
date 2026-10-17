namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.DTOs.Controls;
using ConstructionMS.Application.Services.Controls;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

[ApiController]
[Authorize(Roles = "Storekeeper,Foreman,Supervisor,Finance Officer,CEO,Auditor")]
[Route("api/v1/controls")]
[Produces("application/json")]
public sealed class ControlWorkspaceController(IControlWorkspaceService controls) : ControllerBase
{
    [HttpGet("cash-accounts")]
    [Authorize(Roles = "Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetCashAccounts([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<CashAccountResponseDto>>.Ok(
            await controls.GetCashAccountsAsync(ActorId(), Role(), projectId)));

    [HttpGet("opening-positions")]
    [Authorize(Roles = "Storekeeper,Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetOpeningPositions([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<OpeningPositionResponseDto>>.Ok(
            await controls.GetOpeningPositionsAsync(ActorId(), Role(), projectId)));

    [HttpPost("opening-positions")]
    [Authorize(Roles = "Storekeeper,Finance Officer")]
    public async Task<IActionResult> CreateOpeningPosition([FromBody] CreateOpeningPositionRequestDto request)
    {
        var result = await controls.CreateOpeningPositionAsync(request, ActorId(), Role());
        return Created($"/api/v1/controls/opening-positions/{result.Id}", ApiResponse<OpeningPositionResponseDto>.Ok(result));
    }

    [HttpPost("opening-positions/{id:long}/decision")]
    [Authorize(Roles = "CEO")]
    public async Task<IActionResult> DecideOpeningPosition(long id, [FromBody] OpeningPositionDecisionRequestDto request) =>
        Ok(ApiResponse<OpeningPositionResponseDto>.Ok(
            await controls.DecideOpeningPositionAsync(id, request, ActorId(), Role())));

    [HttpPost("opening-positions/{id:long}/verify")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> VerifyOpeningPosition(long id, [FromBody] OpeningPositionDecisionRequestDto request) =>
        Ok(ApiResponse<OpeningPositionResponseDto>.Ok(
            await controls.VerifyOpeningPositionAsync(id, request, ActorId(), Role())));

    [HttpGet("custody/returns")]
    public async Task<IActionResult> GetMaterialReturns([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<MaterialReturnResponseDto>>.Ok(
            await controls.GetMaterialReturnsAsync(ActorId(), Role(), projectId)));

    [HttpPost("custody/disputes/{materialIssueId:long}/resolve")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> ResolveMaterialIssueDispute(
        long materialIssueId,
        [FromBody] ResolveMaterialIssueDisputeRequestDto request)
        => Ok(ApiResponse<MaterialIssueDisputeResolutionResponseDto>.Ok(
            await controls.ResolveMaterialIssueDisputeAsync(
                materialIssueId, request, ActorId(), Role())));

    [HttpPost("custody/returns")]
    [Authorize(Roles = "Foreman")]
    public async Task<IActionResult> CreateMaterialReturn([FromBody] CreateMaterialReturnRequestDto request)
    {
        var result = await controls.CreateMaterialReturnAsync(request, ActorId(), Role());
        return Created($"/api/v1/controls/custody/returns/{result.Id}", ApiResponse<MaterialReturnResponseDto>.Ok(result));
    }

    [HttpPost("custody/returns/{id:long}/receive")]
    [Authorize(Roles = "Storekeeper")]
    public async Task<IActionResult> ReceiveMaterialReturn(long id, [FromBody] ReceiveMaterialReturnRequestDto request) =>
        Ok(ApiResponse<MaterialReturnResponseDto>.Ok(
            await controls.ReceiveMaterialReturnAsync(id, request, ActorId(), Role())));

    [HttpGet("custody/closeouts")]
    public async Task<IActionResult> GetCustodyCloseouts([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<CustodyCloseoutResponseDto>>.Ok(
            await controls.GetCustodyCloseoutsAsync(ActorId(), Role(), projectId)));

    [HttpPost("custody/closeouts")]
    [Authorize(Roles = "Foreman")]
    public async Task<IActionResult> SubmitCustodyCloseout([FromBody] SubmitCustodyCloseoutRequestDto request)
    {
        var result = await controls.SubmitCustodyCloseoutAsync(request, ActorId(), Role());
        return Created($"/api/v1/controls/custody/closeouts/{result.Id}", ApiResponse<CustodyCloseoutResponseDto>.Ok(result));
    }

    [HttpPost("custody/closeouts/{id:long}/review")]
    [Authorize(Roles = "Supervisor")]
    public async Task<IActionResult> ReviewCustodyCloseout(long id, [FromBody] ReviewCustodyCloseoutRequestDto request) =>
        Ok(ApiResponse<CustodyCloseoutResponseDto>.Ok(
            await controls.ReviewCustodyCloseoutAsync(id, request, ActorId(), Role())));

    [HttpGet("periods")]
    [Authorize(Roles = "Storekeeper,Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetPeriods([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<OperationalPeriodResponseDto>>.Ok(
            await controls.GetPeriodsAsync(ActorId(), Role(), projectId)));

    [HttpPost("periods")]
    [Authorize(Roles = "Supervisor,Finance Officer")]
    public async Task<IActionResult> CreatePeriod([FromBody] CreateOperationalPeriodRequestDto request)
    {
        var result = await controls.CreatePeriodAsync(request, ActorId(), Role());
        return Created($"/api/v1/controls/periods/{result.Id}", ApiResponse<OperationalPeriodResponseDto>.Ok(result));
    }

    [HttpPost("periods/{id:long}/submit-close")]
    [Authorize(Roles = "Supervisor,Finance Officer")]
    public async Task<IActionResult> SubmitPeriodClose(long id, [FromBody] PeriodActionRequestDto request) =>
        Ok(ApiResponse<OperationalPeriodResponseDto>.Ok(
            await controls.SubmitPeriodCloseAsync(id, request, ActorId(), Role())));

    [HttpPost("periods/{id:long}/decision")]
    [Authorize(Roles = "CEO")]
    public async Task<IActionResult> DecidePeriodClose(long id, [FromBody] PeriodDecisionRequestDto request) =>
        Ok(ApiResponse<OperationalPeriodResponseDto>.Ok(
            await controls.DecidePeriodCloseAsync(id, request, ActorId(), Role())));

    [HttpGet("corrections")]
    [Authorize(Roles = "Storekeeper,Supervisor,Finance Officer,CEO,Auditor")]
    public async Task<IActionResult> GetCorrections([FromQuery] int? projectId = null) =>
        Ok(ApiResponse<IReadOnlyList<ControlledCorrectionResponseDto>>.Ok(
            await controls.GetCorrectionsAsync(ActorId(), Role(), projectId)));

    [HttpPost("corrections")]
    [Authorize(Roles = "Storekeeper,Finance Officer")]
    public async Task<IActionResult> CreateCorrection([FromBody] CreateControlledCorrectionRequestDto request)
    {
        var result = await controls.CreateCorrectionAsync(request, ActorId(), Role());
        return Created($"/api/v1/controls/corrections/{result.Id}", ApiResponse<ControlledCorrectionResponseDto>.Ok(result));
    }

    [HttpPost("corrections/{id:long}/decision")]
    [Authorize(Roles = "CEO")]
    public async Task<IActionResult> DecideCorrection(long id, [FromBody] CorrectionDecisionRequestDto request) =>
        Ok(ApiResponse<ControlledCorrectionResponseDto>.Ok(
            await controls.DecideCorrectionAsync(id, request, ActorId(), Role())));

    private int ActorId() => User.GetRequiredUserId();
    private string Role() => User.FindFirstValue(ClaimTypes.Role)
        ?? throw new UnauthorizedAccessException("The authenticated role claim is missing.");
}
