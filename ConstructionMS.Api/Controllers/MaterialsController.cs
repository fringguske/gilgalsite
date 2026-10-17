namespace ConstructionMS.Api.Controllers;

using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;
using ConstructionMS.Application.Services.Materials;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

/// <summary>
/// Reads and maintains the shared material catalogue used by requisitions and
/// procurement. Stock quantities are not stored in this catalogue.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/materials")]
[Produces("application/json")]
public sealed class MaterialsController : ControllerBase
{
    private readonly IMaterialService _materialService;

    public MaterialsController(IMaterialService materialService) =>
        _materialService = materialService;

    /// <summary>Returns material choices for authenticated workflow users.</summary>
    [HttpGet]
    [ProducesResponseType(
        typeof(ApiResponse<PaginatedResult<MaterialResponseDto>>),
        StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<PaginatedResult<MaterialResponseDto>>>> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize)
    {
        var result = await _materialService.GetAllAsync(page, pageSize);
        return Ok(ApiResponse<PaginatedResult<MaterialResponseDto>>.Ok(result));
    }

    /// <summary>Returns one material catalogue record.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<MaterialResponseDto>>> GetById(int id)
    {
        var material = await _materialService.GetByIdAsync(id);
        if (material is null)
        {
            return NotFound(ApiResponse<MaterialResponseDto>.Fail(
                $"Material with ID {id} was not found."));
        }

        return Ok(ApiResponse<MaterialResponseDto>.Ok(material));
    }

    /// <summary>Adds a material to the shared catalogue.</summary>
    [HttpPost]
    [Authorize(Roles = "CEO,Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<MaterialResponseDto>>> Create(
        [FromBody] CreateMaterialRequestDto request)
    {
        var material = await _materialService.CreateAsync(request);
        return CreatedAtAction(
            nameof(GetById),
            new { id = material.Id },
            ApiResponse<MaterialResponseDto>.Ok(material));
    }

    /// <summary>Updates material catalogue metadata and reference pricing.</summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "CEO,Procurement Officer")]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<MaterialResponseDto>>> Update(
        int id,
        [FromBody] UpdateMaterialRequestDto request)
    {
        var material = await _materialService.UpdateAsync(id, request);
        if (material is null)
        {
            return NotFound(ApiResponse<MaterialResponseDto>.Fail(
                $"Material with ID {id} was not found."));
        }

        return Ok(ApiResponse<MaterialResponseDto>.Ok(material));
    }

    /// <summary>Changes the engineering acceptance rule for future purchase orders.</summary>
    [HttpPatch("{id:int}/technical-acceptance-policy")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<MaterialResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<MaterialResponseDto>>> SetTechnicalAcceptancePolicy(
        int id,
        [FromBody] SetMaterialTechnicalAcceptancePolicyRequestDto request)
    {
        var material = await _materialService.SetTechnicalAcceptancePolicyAsync(
            id,
            request.Required!.Value,
            User.GetRequiredUserId());
        if (material is null)
        {
            return NotFound(ApiResponse<MaterialResponseDto>.Fail(
                $"Material with ID {id} was not found."));
        }

        return Ok(ApiResponse<MaterialResponseDto>.Ok(material));
    }
}
