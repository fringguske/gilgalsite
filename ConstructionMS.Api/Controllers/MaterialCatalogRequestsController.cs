namespace ConstructionMS.Api.Controllers;

using System.ComponentModel.DataAnnotations;
using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;
using ConstructionMS.Application.Services.Materials;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize(Roles = "Foreman,Procurement Officer,CEO,Auditor")]
[Route("api/v1/material-catalog-requests")]
[Produces("application/json")]
public sealed class MaterialCatalogRequestsController(
    IMaterialCatalogRequestService materialCatalogRequests) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery, StringLength(20)] string? status = null,
        CancellationToken cancellationToken = default)
    {
        var result = await materialCatalogRequests.GetAllAsync(
            page,
            pageSize,
            status,
            User.GetRequiredUserId(),
            User.GetRequiredRole(),
            cancellationToken);
        return Ok(ApiResponse<PaginatedResult<MaterialCatalogRequestResponseDto>>.Ok(result));
    }

    [HttpPost]
    [Authorize(Roles = "Foreman")]
    public async Task<IActionResult> Submit(
        [FromBody] CreateMaterialCatalogRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await materialCatalogRequests.SubmitAsync(
            request,
            User.GetRequiredUserId(),
            User.GetRequiredRole(),
            cancellationToken);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<MaterialCatalogRequestResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/decision")]
    [Authorize(Roles = "Procurement Officer")]
    public async Task<IActionResult> Review(
        int id,
        [FromBody] ReviewMaterialCatalogRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await materialCatalogRequests.ReviewAsync(
            id,
            request,
            User.GetRequiredUserId(),
            User.GetRequiredRole(),
            cancellationToken);
        return Ok(ApiResponse<MaterialCatalogRequestResponseDto>.Ok(result));
    }
}
