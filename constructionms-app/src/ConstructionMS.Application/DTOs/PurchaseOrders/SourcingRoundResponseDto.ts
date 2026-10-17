export interface SourcingRoundResponseDto {
  id: number
  requisitionId: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  requestedQuantity: number
  createdByUserId: number
  createdByUserName: string
  status: string
  quoteDueAt: Date | null
  notes: string | null
  createdAt: Date
  closedAt: Date | null
  quotes: SupplierQuoteResponseDto[]
  events: SourcingRoundEventResponseDto[]
}

export interface SourcingRoundEventResponseDto {
  id: number
  eventType: string
  fromStatus: string | null
  toStatus: string
  actorUserId: number
  actorUserName: string
  actorRole: string
  notes: string | null
  occurredAt: Date
}

export interface SupplierQuoteResponseDto {
  id: number
  sourcingRoundId: number
  supplierId: number
  supplierName: string
  quoteReference: string
  quantityOffered: number
  unitPrice: number
  standardPriceSnapshot: number
  priceVariancePercentage: number | null
  /** Omitted from JSON when null (JsonIgnore WhenWritingNull). */
  priceAboveStandard?: boolean | null
  totalPrice: number
  validUntil: string | null
  recordedByUserId: number
  recordedByUserName: string
  notes: string | null
  recordedAt: Date
}
