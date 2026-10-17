using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Projects;
using ConstructionMS.Application.Services.Projects;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace ConstructionMS.Api.Controllers;

/// <summary>
/// Project records, executive summaries, versioned budgets and independent
/// engineer progress verifications.
/// </summary>
[ApiController]
[Authorize]
[Route("api/v1/projects")]
[Produces("application/json")]
public sealed class ProjectsController : ControllerBase
{
    private readonly IProjectService _projectService;

    public ProjectsController(IProjectService projectService) => _projectService = projectService;

    /// <summary>
    /// Returns all projects for CEO/auditor users and only active project
    /// assignments for operational users.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PaginatedResult<ProjectResponseDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<PaginatedResult<ProjectResponseDto>>>> GetAll(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize)
    {
        var result = await _projectService.GetAllAsync(
            User.GetRequiredUserId(),
            page,
            pageSize);
        return Ok(ApiResponse<PaginatedResult<ProjectResponseDto>>.Ok(result));
    }

    /// <summary>Returns a project only when it is inside the current user's scope.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<ProjectResponseDto>>> GetById(int id)
    {
        var project = await _projectService.GetByIdAsync(User.GetRequiredUserId(), id);
        if (project is null)
        {
            return NotFound(ApiResponse<ProjectResponseDto>.Fail(
                $"Project with ID {id} was not found."));
        }

        return Ok(ApiResponse<ProjectResponseDto>.Ok(project));
    }

    /// <summary>
    /// Returns the current budget allocation and latest engineer-verified
    /// physical progress without discarding either history.
    /// </summary>
    [HttpGet("{id:int}/summary")]
    [ProducesResponseType(typeof(ApiResponse<ProjectSummaryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ProjectSummaryDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<ProjectSummaryDto>>> GetSummary(int id)
    {
        var summary = await _projectService.GetSummaryAsync(User.GetRequiredUserId(), id);
        if (summary is null)
        {
            return NotFound(ApiResponse<ProjectSummaryDto>.Fail(
                $"Project with ID {id} was not found."));
        }

        return Ok(ApiResponse<ProjectSummaryDto>.Ok(summary));
    }

    /// <summary>Creates a new site and its first immutable budget revision.</summary>
    [HttpPost]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<ProjectResponseDto>>> Create(
        [FromBody] CreateProjectRequestDto request)
    {
        var project = await _projectService.CreateAsync(User.GetRequiredUserId(), request);
        return CreatedAtAction(
            nameof(GetById),
            new { id = project.Id },
            ApiResponse<ProjectResponseDto>.Ok(project));
    }

    /// <summary>
    /// Updates site master data. A budget change creates a new budget revision
    /// instead of editing the previous approval.
    /// </summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<ProjectResponseDto>), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<ProjectResponseDto>>> Update(
        int id,
        [FromBody] UpdateProjectRequestDto request)
    {
        var (project, error) = await _projectService.UpdateAsync(
            User.GetRequiredUserId(),
            id,
            request);

        if (error is not null)
        {
            return BadRequest(ApiResponse<ProjectResponseDto>.Fail(error));
        }

        if (project is null)
        {
            return NotFound(ApiResponse<ProjectResponseDto>.Fail(
                $"Project with ID {id} was not found."));
        }

        return Ok(ApiResponse<ProjectResponseDto>.Ok(project));
    }

    /// <summary>Adds a stable cost code that future budget revisions can allocate.</summary>
    [HttpPost("{id:int}/cost-codes")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<CostCodeResponseDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<CostCodeResponseDto>>> CreateCostCode(
        int id,
        [FromBody] CreateCostCodeRequestDto request)
    {
        var costCode = await _projectService.CreateCostCodeAsync(
            User.GetRequiredUserId(),
            id,
            request);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<CostCodeResponseDto>.Ok(costCode));
    }

    /// <summary>
    /// Appends a complete approved budget revision and cost-code split. Previous
    /// revisions remain intact for audit and comparison.
    /// </summary>
    [HttpPost("{id:int}/budgets")]
    [Authorize(Roles = "CEO")]
    [ProducesResponseType(typeof(ApiResponse<ProjectBudgetResponseDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<ProjectBudgetResponseDto>>> SetBudget(
        int id,
        [FromBody] SetProjectBudgetRequestDto request)
    {
        var budget = await _projectService.SetBudgetAsync(
            User.GetRequiredUserId(),
            id,
            request);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<ProjectBudgetResponseDto>.Ok(budget));
    }

    /// <summary>
    /// Appends an engineer's physical-progress verification. There is
    /// deliberately no update or delete route for these records.
    /// </summary>
    [HttpPost("{id:int}/progress-verifications")]
    [Authorize(Roles = "Engineer")]
    [ProducesResponseType(
        typeof(ApiResponse<ProjectProgressVerificationResponseDto>),
        StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<ProjectProgressVerificationResponseDto>>> VerifyProgress(
        int id,
        [FromBody] CreateProjectProgressVerificationRequestDto request)
    {
        var verification = await _projectService.AddProgressVerificationAsync(
            User.GetRequiredUserId(),
            id,
            request);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<ProjectProgressVerificationResponseDto>.Ok(verification));
    }
}
