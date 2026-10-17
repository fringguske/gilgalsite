using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace ConstructionMS.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/v1/access-requests")]
[Produces("application/json")]
public sealed class AccessRequestsController(IAccessRequestService accessRequests) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery, StringLength(20)] string? status = null,
        CancellationToken cancellationToken = default)
    {
        var result = await accessRequests.GetAllAsync(
            page,
            pageSize,
            status,
            cancellationToken);
        return Ok(ApiResponse<PaginatedResult<AccessRequestResponseDto>>.Ok(result));
    }

    [HttpPost("{id:int}/approve")]
    public async Task<IActionResult> Approve(
        int id,
        [FromBody] ApproveAccessRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await accessRequests.ApproveAsync(
            id,
            request,
            User.GetRequiredUserId(),
            cancellationToken);
        return Ok(ApiResponse<AccessRequestResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/reject")]
    public async Task<IActionResult> Reject(
        int id,
        [FromBody] RejectAccessRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await accessRequests.RejectAsync(
            id,
            request,
            User.GetRequiredUserId(),
            cancellationToken);
        return Ok(ApiResponse<AccessRequestResponseDto>.Ok(result));
    }
}
