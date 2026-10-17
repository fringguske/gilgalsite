namespace ConstructionMS.Api.Controllers;

using System.ComponentModel.DataAnnotations;
using ConstructionMS.Api.Common;
using ConstructionMS.Application.DTOs.Tasks;
using ConstructionMS.Application.Services.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/v1/my-tasks")]
[Produces("application/json")]
public sealed class MyTasksController(IMyTasksService tasks) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, Range(1, int.MaxValue)] int? projectId = null,
        [FromQuery] bool overdueOnly = false,
        CancellationToken cancellationToken = default) =>
        Ok(ApiResponse<MyTasksResponseDto>.Ok(
            await tasks.GetMyTasksAsync(
                User.GetRequiredUserId(),
                User.GetRequiredRole(),
                projectId,
                overdueOnly,
                cancellationToken)));
}
