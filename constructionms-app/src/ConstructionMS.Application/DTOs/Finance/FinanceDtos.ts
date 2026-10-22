import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

export const CreateSupplierInvoiceRequestDto = dto({
  purchaseOrderId: f.int().range(1, INT_MAX),
  invoiceNumber: f.string().required().stringLength(100),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  unitPrice: f.decimal().range('0.01', '9999999999999999.99').decimalPrecision(18, 2),
  amount: f.decimal().range('0.01', '9999999999999999.99').decimalPrecision(18, 2),
  documentReference: f.string().nullable().stringLength(500),
})
export type CreateSupplierInvoiceRequestDto = InferDto<typeof CreateSupplierInvoiceRequestDto>

export const ReviewInvoiceRequestDto = dto({
  notes: f.string().nullable().stringLength(1_000),
})
export type ReviewInvoiceRequestDto = InferDto<typeof ReviewInvoiceRequestDto>

export const CeoInvoiceDecisionRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type CeoInvoiceDecisionRequestDto = InferDto<typeof CeoInvoiceDecisionRequestDto>

export const AuthorizePaymentRequestDto = dto({
  notes: f.string().nullable().stringLength(1_000),
})
export type AuthorizePaymentRequestDto = InferDto<typeof AuthorizePaymentRequestDto>

export const ExecutePaymentRequestDto = dto({
  cashAccountId: f.long().nullable().range(1, '9223372036854775807'),
  method: f.string().required().stringLength(30),
  /** Optional; left empty, the payment's own number is recorded in its place. */
  externalReference: f.string().nullable().stringLength(100),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type ExecutePaymentRequestDto = InferDto<typeof ExecutePaymentRequestDto>

export interface SupplierInvoiceResponseDto {
  id: number
  invoiceNumber: string
  purchaseOrderId: number
  purchaseOrderNumber: string
  requisitionId: number
  projectId: number
  projectName: string
  supplierId: number
  supplierName: string
  materialName: string
  materialUnit: string
  orderedQuantity: number
  orderedUnitPrice: number
  acceptedQuantity: number
  quantity: number
  unitPrice: number
  amount: number
  documentReference: string | null
  status: string
  quantityMatches: boolean
  priceMatches: boolean
  amountMatches: boolean
  requiresTechnicalAcceptance: boolean
  /** Defaults to "NotRequired". */
  technicalAcceptanceStatus: string
  technicalAcceptanceRequiredCount: number
  technicalAcceptanceAcceptedCount: number
  technicalAcceptanceRejectedCount: number
  latestTechnicalReviewerName: string | null
  latestTechnicalReviewAt: Date | null
  requiresCeoApproval: boolean
  matchNotes: string | null
  capturedByName: string
  capturedAt: Date
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: Date | null
  ceoDecision: string | null
  ceoDecisionNotes: string | null
  ceoDecisionAt: Date | null
  authorization: PaymentAuthorizationResponseDto | null
  payment: PaymentResponseDto | null
}

export interface PaymentAuthorizationResponseDto {
  id: number
  authorizationNumber: string
  supplierInvoiceId: number
  projectId: number
  amount: number
  supplierName: string
  projectName: string
  authorizedByUserId: number
  authorizedByName: string
  notes: string | null
  authorizedAt: Date
  isPaid: boolean
}

export interface PaymentResponseDto {
  id: number
  paymentNumber: string
  displayNumber: string
  paymentAuthorizationId: number
  amount: number
  method: string
  externalReference: string
  evidenceReference: string | null
  paidByName: string
  paidAt: Date
  receiptNumber: string
}

export interface CashBookResponseDto {
  generatedAt: Date
  projects: CashBookProjectResponseDto[]
}

export interface CashBookProjectResponseDto {
  projectId: number
  projectName: string
  allocatedBudget: number
  supplierPayments: number
  pettyCashSpent: number
  openCommitments: number
  cashAwaitingAccountability: number
  totalUsed: number
  budgetAvailable: number
  entryCount: number
  recentEntries: CashBookEntryResponseDto[]
}

export interface CashBookEntryResponseDto {
  entryType: string
  title: string
  detail: string
  amount: number
  state: string
  occurredAt: Date
}

export interface ControlEventResponseDto {
  chainKey: string
  sequenceNumber: number
  requisitionId: number | null
  projectId: number
  projectName: string
  entityType: string
  entityId: number
  referenceNumber: string
  eventType: string
  actorName: string
  actorRole: string
  materialName: string | null
  materialUnit: string | null
  requestedQuantity: number | null
  eventQuantity: number | null
  detailsJson: string | null
  occurredAt: Date
  eventHash: string
}
