import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type {
  AuthorizePaymentRequestDto,
  CashBookResponseDto,
  CeoInvoiceDecisionRequestDto,
  ControlEventResponseDto,
  CreateSupplierInvoiceRequestDto,
  ExecutePaymentRequestDto,
  PaymentAuthorizationResponseDto,
  PaymentResponseDto,
  ReviewInvoiceRequestDto,
  SupplierInvoiceResponseDto,
} from '@/ConstructionMS.Application/DTOs/Finance/FinanceDtos'

export interface IFinanceWorkflowService {
  getInvoicesAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, projectId?: number | null, status?: string | null): Promise<PaginatedResult<SupplierInvoiceResponseDto>>
  createInvoiceAsync(request: CreateSupplierInvoiceRequestDto, actorUserId: number, actorRole: string): Promise<SupplierInvoiceResponseDto>
  reviewInvoiceAsync(id: number, request: ReviewInvoiceRequestDto, actorUserId: number, actorRole: string): Promise<SupplierInvoiceResponseDto>
  recordCeoDecisionAsync(id: number, request: CeoInvoiceDecisionRequestDto, actorUserId: number, actorRole: string): Promise<SupplierInvoiceResponseDto>
  authorizePaymentAsync(id: number, request: AuthorizePaymentRequestDto, actorUserId: number, actorRole: string): Promise<SupplierInvoiceResponseDto>
  getAuthorizationsAsync(page: number, pageSize: number, actorUserId: number, actorRole: string, unpaidOnly?: boolean): Promise<PaginatedResult<PaymentAuthorizationResponseDto>>
  executePaymentAsync(authorizationId: number, request: ExecutePaymentRequestDto, actorUserId: number, actorRole: string): Promise<PaymentResponseDto>
  getPaymentsAsync(page: number, pageSize: number, actorUserId: number, actorRole: string): Promise<PaginatedResult<PaymentResponseDto>>
  getCashBookAsync(actorUserId: number, actorRole: string): Promise<CashBookResponseDto>
  getControlEventsAsync(
    page: number,
    pageSize: number,
    actorUserId: number,
    actorRole: string,
    projectId?: number | null,
    requisitionId?: number | null,
    chainKey?: string | null): Promise<PaginatedResult<ControlEventResponseDto>>
}
