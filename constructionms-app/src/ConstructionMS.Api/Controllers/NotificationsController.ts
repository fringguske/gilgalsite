import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import type { NotificationCountResponseDto, NotificationReadResultDto } from '@/ConstructionMS.Application/DTOs/Tasks/TaskDtos'
import type { IInAppNotificationService } from '@/ConstructionMS.Application/Services/Tasks/IInAppNotificationService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class NotificationsControllerImpl extends ControllerBase {
  constructor(private readonly notifications: IInAppNotificationService) { super() }

  async get(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const unreadOnly = this.queryBool('unreadOnly', false)
    return this.ok(ApiResponse.ok(await this.notifications.getAsync(this.currentUserId(), page, pageSize, unreadOnly)))
  }

  async getUnreadCount(): Promise<ActionResult> {
    const body: NotificationCountResponseDto = {
      unreadCount: await this.notifications.getUnreadCountAsync(this.currentUserId()),
    }
    return this.ok(ApiResponse.ok(body))
  }

  async markRead(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const found = await this.notifications.markReadAsync(id, this.currentUserId())
    if (!found) {
      return this.notFound(ApiResponse.fail<string>('The notification was not found.'))
    }

    const body: NotificationReadResultDto = { markedReadCount: 1 }
    return this.ok(ApiResponse.ok(body))
  }

  async markAllRead(): Promise<ActionResult> {
    const body: NotificationReadResultDto = {
      markedReadCount: await this.notifications.markAllReadAsync(this.currentUserId()),
    }
    return this.ok(ApiResponse.ok(body))
  }
}

/** [Authorize] [Route("api/v1/notifications")] */
export const NotificationsController: ControllerMetadata<NotificationsControllerImpl> = {
  route: 'notifications',
  create: services => new NotificationsControllerImpl(services.inAppNotificationService),
  actions: [
    { method: 'GET', template: '', handler: c => c.get() },
    { method: 'GET', template: 'unread-count', handler: c => c.getUnreadCount() },
    { method: 'POST', template: '{id:long}/read', handler: c => c.markRead() },
    { method: 'POST', template: 'read-all', handler: c => c.markAllRead() },
  ],
}
