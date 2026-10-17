/** Properties marked optional are omitted from the JSON when null (JsonIgnore WhenWritingNull). */
export interface PurchaseOrderResponseDto {
  id: number
  purchaseOrderNumber: string
  projectId: number
  projectName: string
  requisitionId: number
  supplierId: number
  supplierName: string
  supplierQuoteId?: number | null
  status: string
  totalAmount?: number | null
  expectedDeliveryDate: string | null
  deliveryLocation: string | null
  notes?: string | null
  createdByUserId?: number | null
  createdByUserName?: string | null
  approvedByUserId?: number | null
  approvedByUserName?: string | null
  issuedByUserId?: number | null
  issuedByUserName?: string | null
  rejectedByUserId?: number | null
  rejectedByUserName?: string | null
  cancelledByUserId?: number | null
  cancelledByUserName?: string | null
  createdAt?: Date | null
  submittedAt?: Date | null
  approvedAt?: Date | null
  issuedAt?: Date | null
  rejectedAt?: Date | null
  cancelledAt?: Date | null
  lines: PurchaseOrderLineResponseDto[]
  events: PurchaseOrderEventResponseDto[]
}

export interface PurchaseOrderLineResponseDto {
  id: number
  requisitionId: number
  materialId: number
  materialName: string
  materialUnit: string
  quantity: number
  requiresTechnicalAcceptance: boolean
  unitPrice?: number | null
  lineTotal?: number | null
}

export interface PurchaseOrderEventResponseDto {
  id: number
  eventType: string
  fromStatus: string | null
  toStatus: string
  actorUserId: number
  actorUserName: string
  actorRole: string
  notes: string | null
  detailsJson?: string | null
  occurredAt: Date
}
