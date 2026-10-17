using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Users;
using ConstructionMS.Application.Services.Users;
using ConstructionMS.Api.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.ComponentModel.DataAnnotations;

namespace ConstructionMS.Api.Controllers;

/// <summary>
/// Manages system users and their role assignments.
/// </summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/v1/users")]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService) => _userService = userService;

    /// <summary>Returns a paginated list of all users with their role names.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<UserResponseDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize)
    {
        var result = await _userService.GetAllAsync(page, pageSize);
        return Ok(ApiResponse<PaginatedResult<UserResponseDto>>.Ok(result));
    }

    /// <summary>Returns a single user by ID. PasswordHash is never included.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _userService.GetByIdAsync(id);
        if (user is null)
            return NotFound(ApiResponse<UserResponseDto>.Fail($"User with ID {id} was not found."));

        return Ok(ApiResponse<UserResponseDto>.Ok(user));
    }

    /// <summary>
    /// Creates a new user. Supply a plain-text password; the service hashes it.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequestDto dto)
    {
        var user = await _userService.CreateAsync(dto, User.GetRequiredUserId());
        return CreatedAtAction(
            nameof(GetById),
            new { id = user.Id },
            ApiResponse<UserResponseDto>.Ok(user));
    }

    /// <summary>Updates user profile fields. Password cannot be changed here.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequestDto dto)
    {
        var user = await _userService.UpdateAsync(id, dto, User.GetRequiredUserId());
        if (user is null)
            return NotFound(ApiResponse<UserResponseDto>.Fail($"User with ID {id} was not found."));

        return Ok(ApiResponse<UserResponseDto>.Ok(user));
    }

    /// <summary>Activates or deactivates an account without deleting its audit identity.</summary>
    [HttpPatch("{id:int}/active")]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<UserResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetActive(
        int id,
        [FromBody] SetUserActiveRequestDto request)
    {
        if (id == User.GetRequiredUserId() && !request.IsActive)
        {
            return BadRequest(ApiResponse<UserResponseDto>.Fail(
                "Use another Administrator account to deactivate your own account."));
        }

        var changed = await _userService.SetActiveStatusAsync(
            id,
            request.IsActive,
            User.GetRequiredUserId());
        if (!changed)
        {
            return NotFound(ApiResponse<UserResponseDto>.Fail(
                $"User with ID {id} was not found."));
        }

        var user = await _userService.GetByIdAsync(id)
            ?? throw new InvalidOperationException(
                "The user disappeared immediately after its active state was changed.");
        return Ok(ApiResponse<UserResponseDto>.Ok(user));
    }
}
