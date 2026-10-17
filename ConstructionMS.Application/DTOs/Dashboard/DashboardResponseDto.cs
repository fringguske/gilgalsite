namespace ConstructionMS.Application.DTOs.Dashboard;

using ConstructionMS.Application.DTOs.Auth;

public sealed class DashboardResponseDto
{
    public CurrentUserDto User { get; init; } = new();
    public int VisibleProjectCount { get; init; }
    public int PendingRequisitionCount { get; init; }
    public int ApprovedRequisitionCount { get; init; }
    public int PendingAccessRequestCount { get; init; }
    public int PendingSupplierOnboardingCount { get; init; }
    public int PendingGoodsReceiptCount { get; init; }
    public int PendingMaterialIssueCount { get; init; }
    public int PendingMaterialConfirmationCount { get; init; }
    public int PendingStockCountReviewCount { get; init; }
    public int PendingInvoiceCaptureCount { get; init; }
    public int PendingInvoiceReviewCount { get; init; }
    public int PendingCeoDecisionCount { get; init; }
    public int PendingPaymentAuthorizationCount { get; init; }
    public int PendingPaymentCount { get; init; }
    public int CompletedPaymentCount { get; init; }
}
