import type { RequisitionProgressDto } from './RequisitionProgressDto'

/** Role-scoped view of a material requisition and its current workflow position. */
export interface RequisitionWorkflowResponseDto {
  id: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  costCodeId: number
  costCode: string
  costCodeName: string
  requestType: string
  quantity: number
  neededByDate: string
  purpose: string
  notes: string | null
  status: string
  workflowRevision: number
  requestedByUserId: number | null
  requestedByUserName: string | null
  createdAt: Date
  updatedAt: Date
  approvedAt: Date | null
  latestTechnicalCheck: TechnicalCheckResponseDto | null
  decidedByUserId: number | null
  decidedByUserName: string | null
  currentActionMessage: string | null
  /**
   * Full event history is populated only for executive/audit readers. Operational
   * roles receive the current state and the evidence required for their own step.
   */
  history: RequisitionWorkflowEventResponseDto[]
  /** The whole journey for every reader; actor names and reasons follow the same role rules as above. */
  progress: RequisitionProgressDto
}

export interface TechnicalCheckResponseDto {
  id: number
  outcome: string
  comments: string | null
  engineerUserId: number | null
  engineerName: string | null
  checkedAt: Date
  requisitionRevision: number
}

export interface RequisitionWorkflowEventResponseDto {
  sequenceNumber: number
  eventType: string
  actorName: string
  actorRole: string
  fromStatus: string | null
  toStatus: string
  comments: string | null
  eventDataJson: string
  occurredAt: Date
  eventHash: string
}
