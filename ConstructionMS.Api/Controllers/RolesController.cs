using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Roles;
using ConstructionMS.Application.Services.Roles;
using ConstructionMS.Api.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.ComponentModel.DataAnnotations;

namespace ConstructionMS.Api.Controllers;

/// <summary>
/// Reads the fixed construction-system roles. Role definitions are not mutable
/// through the API because they form part of the authorization model.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/roles")]
[Route("api/[controller]")]
[Produces("application/json")]
public class RolesController : ControllerBase
{
    private readonly IRoleService _roleService;

    public RolesController(IRoleService roleService) => _roleService = roleService;

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<RoleResponseDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize)
    {
        var result = await _roleService.GetAllAsync(page, pageSize);
        return Ok(ApiResponse<PaginatedResult<RoleResponseDto>>.Ok(result));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<RoleResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<RoleResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var role = await _roleService.GetByIdAsync(id);
        if (role is null)
            return NotFound(ApiResponse<RoleResponseDto>.Fail($"Role with ID {id} was not found."));

        return Ok(ApiResponse<RoleResponseDto>.Ok(role));
    }
}
