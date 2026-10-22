import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

const QUANTITY_MAX = '999999999999999.999'

/** The accepted quantity is how many good ones arrived; only those go into stock. */
export const ReceiveGoodsRequestDto = dto({
  purchaseOrderId: f.int().range(1, INT_MAX),
  deliveredQuantity: f.decimal().range('0.001', QUANTITY_MAX).decimalPrecision(18, 3),
  acceptedQuantity: f.decimal().range('0', QUANTITY_MAX).decimalPrecision(18, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type ReceiveGoodsRequestDto = InferDto<typeof ReceiveGoodsRequestDto>

export const RecordTechnicalAcceptanceRequestDto = dto({
  outcome: f.string().required().stringLength(20),
  notes: f.string().required().stringLength(1_000, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type RecordTechnicalAcceptanceRequestDto = InferDto<typeof RecordTechnicalAcceptanceRequestDto>

export const IssueMaterialRequestDto = dto({
  requisitionId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', QUANTITY_MAX).decimalPrecision(18, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type IssueMaterialRequestDto = InferDto<typeof IssueMaterialRequestDto>

export const ConfirmMaterialIssueRequestDto = dto({
  receivedQuantity: f.decimal().range('0', QUANTITY_MAX).decimalPrecision(18, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type ConfirmMaterialIssueRequestDto = InferDto<typeof ConfirmMaterialIssueRequestDto>

export const RecordMaterialUsageRequestDto = dto({
  usageType: f.string().required().stringLength(20),
  quantity: f.decimal().range('0.001', QUANTITY_MAX).decimalPrecision(18, 3),
  /** Optional, for use and for wastage. */
  purposeOrReason: f.string().nullable().stringLength(500),
  evidenceReference: f.string().nullable().stringLength(500),
  idempotencyKey: f.string().required().stringLength(100, 8),
})
export type RecordMaterialUsageRequestDto = InferDto<typeof RecordMaterialUsageRequestDto>

export const CreateStockTransferRequestDto = dto({
  fromProjectId: f.int().range(1, INT_MAX),
  toProjectId: f.int().range(1, INT_MAX),
  materialId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', QUANTITY_MAX).decimalPrecision(18, 3),
  reason: f.string().required().stringLength(500, 3),
})
export type CreateStockTransferRequestDto = InferDto<typeof CreateStockTransferRequestDto>

export const ReceiveStockTransferRequestDto = dto({
  receivedQuantity: f.decimal().range('0', QUANTITY_MAX).decimalPrecision(18, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type ReceiveStockTransferRequestDto = InferDto<typeof ReceiveStockTransferRequestDto>

export const ResolveStockTransferDisputeRequestDto = dto({
  disposition: f.string().required().stringLength(30),
  notes: f.string().required().stringLength(1_000, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type ResolveStockTransferDisputeRequestDto = InferDto<typeof ResolveStockTransferDisputeRequestDto>

export const CreateStockCountRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  materialId: f.int().range(1, INT_MAX),
  countedQuantity: f.decimal().range('0', QUANTITY_MAX).decimalPrecision(18, 3),
  notes: f.string().nullable().stringLength(1_000),
})
export type CreateStockCountRequestDto = InferDto<typeof CreateStockCountRequestDto>

export const ReviewStockCountRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type ReviewStockCountRequestDto = InferDto<typeof ReviewStockCountRequestDto>

export interface GoodsReceiptResponseDto {
  id: number
  receiptNumber: string
  purchaseOrderId: number
  purchaseOrderNumber: string
  supplierName: string
  requisitionId: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  orderedQuantity: number
  deliveredQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  condition: string
  deliveryNoteReference: string
  evidenceReference: string | null
  discrepancyNotes: string | null
  receivedByName: string
  receivedAt: Date
  requiresTechnicalAcceptance: boolean
  /** Defaults to "NotRequired". */
  technicalAcceptanceStatus: string
  technicalAcceptanceReviewedByName: string | null
  technicalAcceptanceReviewedAt: Date | null
}

export interface TechnicalAcceptanceResponseDto {
  goodsReceiptId: number
  technicalAcceptanceId: number | null
  receiptNumber: string
  purchaseOrderId: number
  purchaseOrderNumber: string
  requisitionId: number
  projectId: number
  projectName: string
  supplierName: string
  materialId: number
  materialName: string
  materialUnit: string
  orderedQuantity: number
  deliveredQuantity: number
  acceptedQuantity: number
  condition: string
  deliveryNoteReference: string
  receiptEvidenceReference: string | null
  receivedByName: string
  receivedAt: Date
  requiresTechnicalAcceptance: boolean
  status: string
  outcome: string | null
  reviewSequence: number | null
  reviewedByUserId: number | null
  reviewedByName: string | null
  notes: string | null
  reviewEvidenceReference: string | null
  reviewedAt: Date | null
}

export interface StockBalanceResponseDto {
  id: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  category: string
  unit: string
  quantityOnHand: number
  reorderLevel: number
  updatedAt: Date
}

export interface StockLedgerEntryResponseDto {
  id: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  unit: string
  movementType: string
  quantityDelta: number
  balanceAfter: number
  referenceType: string
  referenceId: number
  referenceNumber: string
  actorName: string
  notes: string | null
  occurredAt: Date
}

export interface MaterialUsageResponseDto {
  id: number
  usageType: string
  quantity: number
  purposeOrReason: string
  evidenceReference: string | null
  recordedByName: string
  recordedAt: Date
}

export interface MaterialIssueResponseDto {
  id: number
  issueNumber: string
  requisitionId: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  requestedQuantity: number
  quantityIssued: number
  status: string
  issuedByName: string
  issuedToUserId: number
  issuedToName: string
  notes: string | null
  issuedAt: Date
  confirmedQuantity: number | null
  confirmationNotes: string | null
  confirmedAt: Date | null
  usedQuantity: number
  wastedQuantity: number
  returnedQuantity: number
  unaccountedQuantity: number
  custodyStatus: string
  usage: MaterialUsageResponseDto[]
}

export interface StockTransferResponseDto {
  id: number
  transferNumber: string
  fromProjectId: number
  fromProjectName: string
  toProjectId: number
  toProjectName: string
  materialId: number
  materialName: string
  materialUnit: string
  quantity: number
  reason: string
  status: string
  requestedByName: string
  requestedAt: Date
  dispatchedByUserId: number | null
  dispatchedByName: string | null
  dispatchedAt: Date | null
  receivedByName: string | null
  receivedQuantity: number | null
  receiptNotes: string | null
  receivedAt: Date | null
  resolvedByName: string | null
  resolutionDisposition: string | null
  resolutionQuantity: number | null
  resolutionNotes: string | null
  resolutionEvidenceReference: string | null
  resolvedAt: Date | null
}

export interface StockCountResponseDto {
  id: number
  countNumber: string
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  systemQuantity: number
  countedQuantity: number
  variance: number
  notes: string
  status: string
  countedByName: string
  countedAt: Date
  reviewedByName: string | null
  reviewNotes: string | null
  reviewedAt: Date | null
}
