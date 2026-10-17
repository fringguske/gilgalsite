namespace ConstructionMS.Application.Services.Tasks;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Tasks;

public interface IInAppNotificationService
{
    Task<PaginatedResult<InAppNotificationResponseDto>> GetAsync(
        int userId,
        int page,
        int pageSize,
        bool unreadOnly,
        CancellationToken cancellationToken = default);

    Task<int> GetUnreadCountAsync(int userId, CancellationToken cancellationToken = default);
    Task<bool> MarkReadAsync(long notificationId, int userId, CancellationToken cancellationToken = default);
    Task<int> MarkAllReadAsync(int userId, CancellationToken cancellationToken = default);
    Task<int> GenerateOverdueAsync(CancellationToken cancellationToken = default);
}
