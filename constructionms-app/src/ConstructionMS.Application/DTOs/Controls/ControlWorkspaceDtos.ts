import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

const LONG_MAX = '9223372036854775807'

export const OpeningInventoryLineRequestDto = dto({
  materialId: f.int().range(1, INT_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  unitCost: f.decimal().nullable().range('0', '9999999999999999.99').decimalPrecision(18, 2),
})
export type OpeningInventoryLineRequestDto = InferDto<typeof OpeningInventoryLineRequestDto>

export const OpeningCashLineRequestDto = dto({
  accountName: f.string().required().stringLength(100, 2),
  amount: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
})
export type OpeningCashLineRequestDto = InferDto<typeof OpeningCashLineRequestDto>

export const CreateOpeningPositionRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  positionType: f.string().required().stringLength(20),
  asOfDate: f.dateOnly(),
  notes: f.string().nullable().stringLength(1_000),
  evidenceReference: f.string().nullable().stringLength(500),
  inventoryLines: f.list(OpeningInventoryLineRequestDto),
  cashLines: f.list(OpeningCashLineRequestDto),
})
export type CreateOpeningPositionRequestDto = InferDto<typeof CreateOpeningPositionRequestDto>

export const OpeningPositionDecisionRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type OpeningPositionDecisionRequestDto = InferDto<typeof OpeningPositionDecisionRequestDto>

export interface OpeningInventoryLineResponseDto {
  materialId: number
  materialName: string
  unit: string
  quantity: number
  unitCost: number | null
}

export interface OpeningCashLineResponseDto {
  accountName: string
  amount: number
}

export interface CashAccountResponseDto {
  id: number
  projectId: number
  projectName: string
  name: string
  balance: number
  updatedAt: Date
}

export interface OpeningPositionResponseDto {
  id: number
  batchNumber: string
  positionType: string
  projectId: number
  projectName: string
  asOfDate: string
  notes: string | null
  evidenceReference: string | null
  status: string
  submittedByName: string
  submittedAt: Date
  verifiedByName: string | null
  verificationNotes: string | null
  verifiedAt: Date | null
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: Date | null
  inventoryLines: OpeningInventoryLineResponseDto[]
  cashLines: OpeningCashLineResponseDto[]
}

export const CreateMaterialReturnRequestDto = dto({
  materialIssueId: f.long().range(1, LONG_MAX),
  quantity: f.decimal().range('0.001', '999999999999999.999').decimalPrecision(18, 3),
  condition: f.string().required().stringLength(30),
  notes: f.string().nullable().stringLength(1_000),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type CreateMaterialReturnRequestDto = InferDto<typeof CreateMaterialReturnRequestDto>

export const ResolveMaterialIssueDisputeRequestDto = dto({
  notes: f.string().required().stringLength(1_000, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type ResolveMaterialIssueDisputeRequestDto = InferDto<typeof ResolveMaterialIssueDisputeRequestDto>

export interface MaterialIssueDisputeResolutionResponseDto {
  id: number
  resolutionNumber: string
  materialIssueId: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  issuedQuantity: number
  foremanReceivedQuantity: number
  returnedToStoreQuantity: number
  notes: string
  evidenceReference: string | null
  resolvedByName: string
  resolvedAt: Date
}

export const ReceiveMaterialReturnRequestDto = dto({
  accept: f.bool(),
  quantityAccepted: f.decimal().range('0', '999999999999999.999').decimalPrecision(18, 3),
  notes: f.string().required().stringLength(1_000, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type ReceiveMaterialReturnRequestDto = InferDto<typeof ReceiveMaterialReturnRequestDto>

export interface MaterialReturnResponseDto {
  id: number
  returnNumber: string
  materialIssueId: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  quantityOffered: number
  quantityAccepted: number | null
  condition: string
  status: string
  returnedByName: string
  returnedAt: Date
  receivedByName: string | null
  receivedAt: Date | null
  notes: string | null
  evidenceReference: string | null
}

export const SubmitCustodyCloseoutRequestDto = dto({
  materialIssueId: f.long().range(1, LONG_MAX),
  notes: f.string().nullable().stringLength(1_000),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type SubmitCustodyCloseoutRequestDto = InferDto<typeof SubmitCustodyCloseoutRequestDto>

export const ReviewCustodyCloseoutRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type ReviewCustodyCloseoutRequestDto = InferDto<typeof ReviewCustodyCloseoutRequestDto>

export interface CustodyCloseoutResponseDto {
  id: number
  closeoutNumber: string
  materialIssueId: number
  revision: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  confirmedQuantity: number
  usedQuantity: number
  wastedQuantity: number
  returnedQuantity: number
  unaccountedQuantity: number
  status: string
  submittedByName: string
  submittedAt: Date
  notes: string | null
  evidenceReference: string | null
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: Date | null
}

export const CreateOperationalPeriodRequestDto = dto({
  projectId: f.int().range(1, INT_MAX),
  scope: f.string().required().stringLength(20),
  name: f.string().required().stringLength(100, 2),
  startDate: f.dateOnly(),
  endDate: f.dateOnly(),
})
export type CreateOperationalPeriodRequestDto = InferDto<typeof CreateOperationalPeriodRequestDto>

export const PeriodActionRequestDto = dto({
  notes: f.string().required().stringLength(1_000, 3),
})
export type PeriodActionRequestDto = InferDto<typeof PeriodActionRequestDto>

export const PeriodDecisionRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type PeriodDecisionRequestDto = InferDto<typeof PeriodDecisionRequestDto>

export interface OperationalPeriodResponseDto {
  id: number
  periodNumber: string
  projectId: number
  projectName: string
  scope: string
  name: string
  startDate: string
  endDate: string
  status: string
  createdByName: string
  createdAt: Date
  latestEventType: string | null
  latestEventNotes: string | null
  latestActorName: string | null
  latestEventAt: Date | null
}

export const CreateControlledCorrectionRequestDto = dto({
  operationalPeriodId: f.long().range(1, LONG_MAX),
  correctionType: f.string().required().stringLength(20),
  materialId: f.int().nullable().range(1, INT_MAX),
  cashAccountName: f.string().nullable().stringLength(100),
  quantityDelta: f.decimal().range('-999999999999999.999', '999999999999999.999').decimalPrecision(18, 3),
  amountDelta: f.decimal().range('-9999999999999999.99', '9999999999999999.99').decimalPrecision(18, 2),
  reason: f.string().required().stringLength(1_000, 3),
  evidenceReference: f.string().nullable().stringLength(500),
})
export type CreateControlledCorrectionRequestDto = InferDto<typeof CreateControlledCorrectionRequestDto>

export const CorrectionDecisionRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type CorrectionDecisionRequestDto = InferDto<typeof CorrectionDecisionRequestDto>

export interface ControlledCorrectionResponseDto {
  id: number
  correctionNumber: string
  operationalPeriodId: number
  periodName: string
  projectId: number
  projectName: string
  correctionType: string
  materialId: number | null
  materialName: string | null
  unit: string | null
  cashAccountName: string | null
  quantityDelta: number
  amountDelta: number
  reason: string
  evidenceReference: string | null
  status: string
  submittedByName: string
  submittedAt: Date
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: Date | null
}
