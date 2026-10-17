export interface MyTasksResponseDto {
  generatedAt: Date
  actualRole: string
  totalCount: number
  overdueCount: number
  items: MyTaskResponseDto[]
}

export interface MyTaskResponseDto {
  taskKey: string
  taskType: string
  title: string
  detail: string
  requiredRole: string
  projectId: number | null
  projectName: string | null
  sourceEntityType: string
  sourceEntityId: number
  targetPath: string
  openedAt: Date
  dueAt: Date
  isOverdue: boolean
  /** Defaults to "Normal". */
  priority: string
}

export interface InAppNotificationResponseDto {
  id: number
  taskKey: string
  taskType: string
  title: string
  message: string
  projectId: number | null
  projectName: string | null
  targetPath: string
  taskDueAt: Date
  createdAt: Date
  isRead: boolean
  readAt: Date | null
}

export interface NotificationCountResponseDto {
  unreadCount: number
}

export interface NotificationReadResultDto {
  markedReadCount: number
}
