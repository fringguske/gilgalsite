namespace ConstructionMS.Application.Services.Dashboard;

using ConstructionMS.Application.DTOs.Dashboard;

public interface IDashboardService
{
    Task<DashboardResponseDto> GetAsync(int userId);
}
