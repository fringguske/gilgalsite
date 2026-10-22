import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

export const CreatePettyCashRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  costCodeId: f.int().range(1, INT_MAX),
  purpose: f.string().required().stringLength(500, 3),
  amount: f.decimal().range('0.01', '100000').decimalPrecision(18, 2),
  neededByDate: f.dateOnly(),
})
export type CreatePettyCashRequestDto = InferDto<typeof CreatePettyCashRequestDto>

export const DecidePettyCashRequestDto = dto({
  approve: f.bool(),
  amountApproved: f.decimal().nullable().range('0.01', '100000').decimalPrecision(18, 2),
  notes: f.string().required().stringLength(1_000, 3),
})
export type DecidePettyCashRequestDto = InferDto<typeof DecidePettyCashRequestDto>

export const DisbursePettyCashRequestDto = dto({
  cashAccountId: f.long().nullable().range(1, '9223372036854775807'),
  method: f.string().required().stringLength(30),
  recipientName: f.string().required().stringLength(150, 3),
  recipientAcknowledgementReference: f.string().required().stringLength(500, 3),
  evidenceReference: f.string().required().stringLength(500, 3),
})
export type DisbursePettyCashRequestDto = InferDto<typeof DisbursePettyCashRequestDto>

export const ConfirmPettyCashReceiptDto = dto({
  amountReceived: f.decimal().range('0.01', '100000').decimalPrecision(18, 2),
  notes: f.string().nullable().stringLength(500),
})
export type ConfirmPettyCashReceiptDto = InferDto<typeof ConfirmPettyCashReceiptDto>

export const SubmitPettyCashReconciliationDto = dto({
  amountSpent: f.decimal().range('0', '100000').decimalPrecision(18, 2),
  amountReturned: f.decimal().range('0', '100000').decimalPrecision(18, 2),
  evidenceReference: f.string().required().stringLength(500, 3),
  returnReference: f.string().nullable().stringLength(100),
  notes: f.string().required().stringLength(1_000, 3),
})
export type SubmitPettyCashReconciliationDto = InferDto<typeof SubmitPettyCashReconciliationDto>

export const ReviewPettyCashReconciliationDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type ReviewPettyCashReconciliationDto = InferDto<typeof ReviewPettyCashReconciliationDto>

export interface PettyCashRequestResponseDto {
  id: number
  requestNumber: string
  projectId: number
  projectName: string
  costCodeId: number
  costCode: string
  costCodeName: string
  purpose: string
  amountRequested: number
  amountApproved: number | null
  amountCommitted: number | null
  /** DateOnly: YYYY-MM-DD. */
  neededByDate: string
  status: string
  requestedByName: string
  requestedByUserId: number
  requestedAt: Date
  financeApprovedByUserId: number | null
  financeApprovedByName: string | null
  financeDecisionAt: Date | null
  financeDecisionNotes: string | null
  disbursement: PettyCashDisbursementResponseDto | null
  receiptConfirmation: PettyCashReceiptConfirmationResponseDto | null
  latestReconciliation: PettyCashReconciliationResponseDto | null
}

export interface PettyCashDisbursementResponseDto {
  id: number
  disbursementNumber: string
  amount: number
  method: string
  externalReference: string
  recipientName: string
  recipientAcknowledgementReference: string
  evidenceReference: string
  disbursedByUserId: number
  disbursedByName: string
  disbursedAt: Date
}

export interface PettyCashReceiptConfirmationResponseDto {
  id: number
  confirmationNumber: string
  amountReceived: number
  notes: string | null
  confirmedByUserId: number
  confirmedByName: string
  confirmedAt: Date
}

export interface PettyCashReconciliationResponseDto {
  id: number
  reconciliationNumber: string
  amountSpent: number
  amountReturned: number
  amountUnaccounted: number
  amountExpensed: number | null
  evidenceReference: string
  returnReference: string | null
  notes: string | null
  submittedByName: string
  submittedAt: Date
  status: string
  reviewedByName: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
}
