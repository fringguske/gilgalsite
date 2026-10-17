namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;
using ConstructionMS.Application.Services.Suppliers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

/// <summary>
/// Maintains the supplier register used for sourcing and purchase orders.
/// Supplier financial/contact details are restricted to procurement oversight
/// roles and are omitted from collection responses.
/// </summary>
[ApiController]
[Authorize(Roles = "Procurement Officer,Finance Officer,CEO,Auditor")]
[Route("api/v1/suppliers")]
[Produces("application/json")]
public sealed class SuppliersController : ControllerBase
{
    private readonly ISupplierService _supplierService;

    public SuppliersController(ISupplierService supplierService) =>
        _supplierService = supplierService;

    /// <summary>
    /// Returns supplier selection data without KRA, M-Pesa or contact details.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(
        typeof(ApiResponse<PaginatedResult<SupplierSummaryResponseDto>>),
        StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<PaginatedResult<SupplierSummaryResponseDto>>>> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize)
    {
        var result = await _supplierService.GetAllAsync(page, pageSize);
        var summaries = new PaginatedResult<SupplierSummaryResponseDto>
        {
            Items = result.Items.Select(ToSummary).ToList(),
            TotalCount = result.TotalCount,
            Page = result.Page,
            PageSize = result.PageSize
        };

        return Ok(ApiResponse<PaginatedResult<SupplierSummaryResponseDto>>.Ok(summaries));
    }

    /// <summary>
    /// Returns the complete supplier record, including tax, payment and contact
    /// fields, to authorized procurement oversight roles.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<SupplierResponseDto>>> GetById(int id)
    {
        var supplier = await _supplierService.GetByIdAsync(id);
        if (supplier is null)
        {
            return NotFound(ApiResponse<SupplierResponseDto>.Fail(
                $"Supplier with ID {id} was not found."));
        }

        return Ok(ApiResponse<SupplierResponseDto>.Ok(supplier));
    }

    /// <summary>Updates supplier identity, tax, contact and payment metadata.</summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<SupplierResponseDto>>> Update(
        int id,
        [FromBody] UpdateSupplierRequestDto request)
    {
        var supplier = await _supplierService.UpdateAsync(id, request);
        if (supplier is null)
        {
            return NotFound(ApiResponse<SupplierResponseDto>.Fail(
                $"Supplier with ID {id} was not found."));
        }

        return Ok(ApiResponse<SupplierResponseDto>.Ok(supplier));
    }

    /// <summary>
    /// Explicitly blocks or reinstates a supplier. Kept CEO-only so the officer
    /// who selects quotations cannot override a supplier control flag.
    /// </summary>
    [HttpPatch("{id:int}/blacklist")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<SupplierResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<SupplierResponseDto>>> SetBlacklistStatus(
        int id,
        [FromBody] SetSupplierBlacklistRequestDto request)
    {
        var updated = await _supplierService.SetBlacklistStatusAsync(id, request.IsBlacklisted);
        if (!updated)
        {
            return NotFound(ApiResponse<SupplierResponseDto>.Fail(
                $"Supplier with ID {id} was not found."));
        }

        var supplier = await _supplierService.GetByIdAsync(id)
            ?? throw new InvalidOperationException(
                "The supplier disappeared immediately after its blacklist state was updated.");

        return Ok(ApiResponse<SupplierResponseDto>.Ok(supplier));
    }

    private static SupplierSummaryResponseDto ToSummary(SupplierResponseDto supplier) => new()
    {
        Id = supplier.Id,
        Name = supplier.Name,
        Category = supplier.Category,
        IsBlacklisted = supplier.IsBlacklisted,
        CreatedAt = supplier.CreatedAt
    };
}
