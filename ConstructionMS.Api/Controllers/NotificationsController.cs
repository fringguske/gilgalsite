namespace ConstructionMS.Api.Controllers;

using System.ComponentModel.DataAnnotations;
using ConstructionMS.Api.Common;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Tasks;
using ConstructionMS.Application.Services.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/v1/notifications")]
[Produces("application/json")]
public sealed class NotificationsController(IInAppNotificationService notifications) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, Range(1, int.MaxValue)] int page = 1,
        [FromQuery, Range(1, Pagination.MaxPageSize)] int pageSize = Pagination.DefaultPageSize,
        [FromQuery] bool unreadOnly = false,
        CancellationToken cancellationToken = default) =>
        Ok(ApiResponse<PaginatedResult<InAppNotificationResponseDto>>.Ok(
            await notifications.GetAsync(
                User.GetRequiredUserId(),
                page,
                pageSize,
                unreadOnly,
                cancellationToken)));

    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount(CancellationToken cancellationToken = default) =>
        Ok(ApiResponse<NotificationCountResponseDto>.Ok(new NotificationCountResponseDto
        {
            UnreadCount = await notifications.GetUnreadCountAsync(
                User.GetRequiredUserId(), cancellationToken)
        }));

    [HttpPost("{id:long}/read")]
    public async Task<IActionResult> MarkRead(long id, CancellationToken cancellationToken = default)
    {
        var found = await notifications.MarkReadAsync(
            id, User.GetRequiredUserId(), cancellationToken);
        return found
            ? Ok(ApiResponse<NotificationReadResultDto>.Ok(new NotificationReadResultDto
            {
                MarkedReadCount = 1
            }))
            : NotFound(ApiResponse<string>.Fail("The notification was not found."));
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken = default) =>
        Ok(ApiResponse<NotificationReadResultDto>.Ok(new NotificationReadResultDto
        {
            MarkedReadCount = await notifications.MarkAllReadAsync(
                User.GetRequiredUserId(), cancellationToken)
        }));
}
