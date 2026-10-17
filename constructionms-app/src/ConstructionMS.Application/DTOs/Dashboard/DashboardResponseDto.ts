import type { CurrentUserDto } from '../Auth/CurrentUserDto'

export interface DashboardResponseDto {
  user: CurrentUserDto
  visibleProjectCount: number
  pendingRequisitionCount: number
  approvedRequisitionCount: number
  pendingAccessRequestCount: number
  pendingSupplierOnboardingCount: number
  pendingGoodsReceiptCount: number
  pendingMaterialIssueCount: number
  pendingMaterialConfirmationCount: number
  pendingStockCountReviewCount: number
  pendingInvoiceCaptureCount: number
  pendingInvoiceReviewCount: number
  pendingCeoDecisionCount: number
  pendingPaymentAuthorizationCount: number
  pendingPaymentCount: number
  completedPaymentCount: number
}
