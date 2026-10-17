using ConstructionMS.Api.Common;
using ConstructionMS.Application.DTOs.Dashboard;
using ConstructionMS.Application.Services.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ConstructionMS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/dashboard")]
[Produces("application/json")]
public sealed class DashboardController : ControllerBase
{
    private readonly IDashboardService _dashboardService;

    public DashboardController(IDashboardService dashboardService) => _dashboardService = dashboardService;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<DashboardResponseDto>>> Get()
    {
        var dashboard = await _dashboardService.GetAsync(User.GetRequiredUserId());
        return Ok(ApiResponse<DashboardResponseDto>.Ok(dashboard));
    }
}
