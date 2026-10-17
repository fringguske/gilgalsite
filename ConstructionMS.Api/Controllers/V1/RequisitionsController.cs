namespace ConstructionMS.Api.Controllers.V1;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Requisitions.V1;
using ConstructionMS.Application.Services.Requisitions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

/// <summary>Authenticated Foreman -> Engineer -> Supervisor material-request workflow.</summary>
[ApiController]
[Authorize]
[Route("api/v1/requisitions")]
[Produces("application/json")]
public sealed class RequisitionsController : ControllerBase
{
    private readonly IRequisitionWorkflowService _workflow;

    public RequisitionsController(IRequisitionWorkflowService workflow) => _workflow = workflow;

    /// <summary>Returns only requisitions visible to the authenticated user's role and projects.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<RequisitionWorkflowResponseDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery, StringLength(50)] string? status = null,
        [FromQuery, Range(1, int.MaxValue)] int? projectId = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _workflow.GetAllAsync(
            User.GetRequiredUserId(), page, pageSize, status, projectId, cancellationToken);
        return ToActionResult(result);
    }

    /// <summary>Returns one role- and project-scoped requisition.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        var result = await _workflow.GetByIdAsync(User.GetRequiredUserId(), id, cancellationToken);
        return ToActionResult(result);
    }

    /// <summary>Creates a request as the authenticated foreman.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create(
        [FromBody] CreateRequisitionV1RequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await _workflow.CreateAsync(User.GetRequiredUserId(), request, cancellationToken);
        if (!result.Succeeded)
        {
            return ToActionResult(result);
        }

        return CreatedAtAction(
            nameof(GetById),
            new { id = result.Value!.Id },
            ApiResponse<RequisitionWorkflowResponseDto>.Ok(result.Value));
    }

    /// <summary>
    /// Creates a bulk store-replenishment request. It requires Supervisor approval,
    /// enters Procurement sourcing, and is never eligible for a foreman issue voucher.
    /// </summary>
    [HttpPost("stock-replenishment")]
    [Authorize(Roles = "Storekeeper")]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateStockReplenishment(
        [FromBody] CreateStockReplenishmentRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await _workflow.CreateStockReplenishmentAsync(
            User.GetRequiredUserId(), request, cancellationToken);
        if (!result.Succeeded)
        {
            return ToActionResult(result);
        }

        return CreatedAtAction(
            nameof(GetById),
            new { id = result.Value!.Id },
            ApiResponse<RequisitionWorkflowResponseDto>.Ok(result.Value));
    }

    /// <summary>
    /// Revises a request as its original foreman. ExpectedRevision protects a newer
    /// engineer or supervisor action from being overwritten.
    /// </summary>
    [HttpPatch("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        int id,
        [FromBody] UpdateRequisitionV1RequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await _workflow.UpdateAsync(User.GetRequiredUserId(), id, request, cancellationToken);
        return ToActionResult(result);
    }

    /// <summary>Records the authenticated assigned engineer's technical check.</summary>
    [HttpPost("{id:int}/technical-check")]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> TechnicalCheck(
        int id,
        [FromBody] TechnicalCheckRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await _workflow.RecordTechnicalCheckAsync(
            User.GetRequiredUserId(), id, request, cancellationToken);
        return ToActionResult(result);
    }

    /// <summary>Records the authenticated assigned supervisor's independent decision.</summary>
    [HttpPost("{id:int}/decision")]
    [ProducesResponseType(typeof(ApiResponse<RequisitionWorkflowResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Decide(
        int id,
        [FromBody] SupervisorDecisionRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await _workflow.RecordSupervisorDecisionAsync(
            User.GetRequiredUserId(), id, request, cancellationToken);
        return ToActionResult(result);
    }

    private IActionResult ToActionResult<T>(OperationResult<T> result)
    {
        if (result.Succeeded)
        {
            return Ok(ApiResponse<T>.Ok(result.Value!));
        }

        var body = ApiResponse<T>.Fail(result.Error ?? "The request could not be completed.");
        return result.ErrorKind switch
        {
            OperationErrorKind.Validation => BadRequest(body),
            OperationErrorKind.NotFound => NotFound(body),
            OperationErrorKind.Forbidden => StatusCode(StatusCodes.Status403Forbidden, body),
            OperationErrorKind.Conflict => Conflict(body),
            _ => StatusCode(StatusCodes.Status500InternalServerError, body)
        };
    }
}
