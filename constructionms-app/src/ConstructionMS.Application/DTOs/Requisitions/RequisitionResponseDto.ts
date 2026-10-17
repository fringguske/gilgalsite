/** Flat requisition projection with display names for related records. */
export interface RequisitionResponseDto {
  id: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  quantity: number
  requestedByUserId: number
  requestedByUserName: string
  approvedByUserId: number | null
  approvedByUserName: string | null
  /** One of: "Pending", "Approved" or "Rejected". */
  status: string
  notes: string | null
  createdAt: Date
  approvedAt: Date | null
}
