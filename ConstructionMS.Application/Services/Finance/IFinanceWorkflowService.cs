namespace ConstructionMS.Application.Services.Finance;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Finance;

public interface IFinanceWorkflowService
{
    Task<PaginatedResult<SupplierInvoiceResponseDto>> GetInvoicesAsync(int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, string? status = null);
    Task<SupplierInvoiceResponseDto> CreateInvoiceAsync(CreateSupplierInvoiceRequestDto request, int actorUserId, string actorRole);
    Task<SupplierInvoiceResponseDto> ReviewInvoiceAsync(long id, ReviewInvoiceRequestDto request, int actorUserId, string actorRole);
    Task<SupplierInvoiceResponseDto> RecordCeoDecisionAsync(long id, CeoInvoiceDecisionRequestDto request, int actorUserId, string actorRole);
    Task<SupplierInvoiceResponseDto> AuthorizePaymentAsync(long id, AuthorizePaymentRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<PaymentAuthorizationResponseDto>> GetAuthorizationsAsync(int page, int pageSize, int actorUserId, string actorRole, bool unpaidOnly = false);
    Task<PaymentResponseDto> ExecutePaymentAsync(long authorizationId, ExecutePaymentRequestDto request, int actorUserId, string actorRole);
    Task<PaginatedResult<PaymentResponseDto>> GetPaymentsAsync(int page, int pageSize, int actorUserId, string actorRole);
    Task<CashBookResponseDto> GetCashBookAsync(int actorUserId, string actorRole);
    Task<PaginatedResult<ControlEventResponseDto>> GetControlEventsAsync(
        int page,
        int pageSize,
        int actorUserId,
        string actorRole,
        int? projectId = null,
        int? requisitionId = null,
        string? chainKey = null);
}
