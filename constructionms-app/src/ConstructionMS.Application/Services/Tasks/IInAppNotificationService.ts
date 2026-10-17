import type { PaginatedResult } from '../../Common/PaginatedResult'
import type { InAppNotificationResponseDto } from '../../DTOs/Tasks/TaskDtos'

export interface IInAppNotificationService {
  getAsync(userId: number, page: number, pageSize: number, unreadOnly: boolean): Promise<PaginatedResult<InAppNotificationResponseDto>>
  getUnreadCountAsync(userId: number): Promise<number>
  markReadAsync(notificationId: number, userId: number): Promise<boolean>
  markAllReadAsync(userId: number): Promise<number>
  generateOverdueAsync(): Promise<number>
}
