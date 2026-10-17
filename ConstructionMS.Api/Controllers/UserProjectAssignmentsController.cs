using ConstructionMS.Api.Common;
using ConstructionMS.Application.DTOs.Auth;
using ConstructionMS.Application.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ConstructionMS.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/v1/users/{userId:int}/projects")]
[Produces("application/json")]
public sealed class UserProjectAssignmentsController : ControllerBase
{
    private readonly IUserProjectAssignmentService _assignmentService;

    public UserProjectAssignmentsController(IUserProjectAssignmentService assignmentService) =>
        _assignmentService = assignmentService;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AssignedProjectDto>>>> Get(int userId)
    {
        var assignments = await _assignmentService.GetAssignmentsAsync(userId);
        return Ok(ApiResponse<IReadOnlyList<AssignedProjectDto>>.Ok(assignments));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AssignedProjectDto>>>> Replace(
        int userId,
        [FromBody] UpdateProjectAssignmentsRequestDto request)
    {
        var assignments = await _assignmentService.ReplaceAssignmentsAsync(
            userId,
            request.ProjectIds,
            User.GetRequiredUserId());
        return Ok(ApiResponse<IReadOnlyList<AssignedProjectDto>>.Ok(assignments));
    }
}
