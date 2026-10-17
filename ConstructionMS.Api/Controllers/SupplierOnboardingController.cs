namespace ConstructionMS.Api.Controllers;

using System.ComponentModel.DataAnnotations;
using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;
using ConstructionMS.Application.Services.Suppliers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize(Roles = "Procurement Officer,Finance Officer,CEO,Auditor")]
[Route("api/v1/supplier-onboarding")]
[Produces("application/json")]
public sealed class SupplierOnboardingController(
    ISupplierOnboardingService supplierOnboarding) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var result = await supplierOnboarding.GetByIdAsync(id, cancellationToken)
            ?? throw new KeyNotFoundException("The supplier onboarding request was not found.");
        return Ok(ApiResponse<SupplierOnboardingResponseDto>.Ok(result));
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery, StringLength(20)] string? status = null,
        CancellationToken cancellationToken = default)
    {
        var result = await supplierOnboarding.GetAllAsync(
            page,
            pageSize,
            status,
            cancellationToken);
        return Ok(ApiResponse<PaginatedResult<SupplierOnboardingResponseDto>>.Ok(result));
    }

    [HttpPost]
    [Authorize(Roles = "Procurement Officer")]
    public async Task<IActionResult> Submit(
        [FromBody] CreateSupplierOnboardingRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await supplierOnboarding.SubmitAsync(
            request,
            User.GetRequiredUserId(),
            User.GetRequiredRole(),
            cancellationToken);
        return Created(
            $"/api/v1/supplier-onboarding/{result.Id}",
            ApiResponse<SupplierOnboardingResponseDto>.Ok(result));
    }

    [HttpPost("{id:int}/decision")]
    [Authorize(Roles = "Finance Officer,CEO")]
    public async Task<IActionResult> Review(
        int id,
        [FromBody] ReviewSupplierOnboardingRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await supplierOnboarding.ReviewAsync(
            id,
            request,
            User.GetRequiredUserId(),
            User.GetRequiredRole(),
            cancellationToken);
        return Ok(ApiResponse<SupplierOnboardingResponseDto>.Ok(result));
    }
}
