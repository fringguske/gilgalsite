namespace ConstructionMS.Infrastructure.Services.Dashboard;

using ConstructionMS.Application.DTOs.Dashboard;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Dashboard;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class DashboardService : IDashboardService
{
    private readonly AppDbContext _db;
    private readonly IAuthenticationService _authenticationService;

    public DashboardService(AppDbContext db, IAuthenticationService authenticationService)
    {
        _db = db;
        _authenticationService = authenticationService;
    }

    public async Task<DashboardResponseDto> GetAsync(int userId)
    {
        var user = await _authenticationService.GetCurrentUserAsync(userId)
            ?? throw new UnauthorizedAccessException("The authenticated user is inactive or no longer exists.");

        var visibleProjectIds = user.Projects.Select(project => project.Id).ToArray();
        var requisitions = _db.Requisitions
            .AsNoTracking()
            .Where(requisition => visibleProjectIds.Contains(requisition.ProjectId));

        var activeInvoiceStatuses = new[]
        {
            InvoiceStatuses.PendingReview,
            InvoiceStatuses.Matched,
            InvoiceStatuses.AwaitingCeoApproval,
            InvoiceStatuses.ReadyForAuthorization,
            InvoiceStatuses.Authorized,
            InvoiceStatuses.Paid
        };

        var pendingGoodsReceiptCount = await _db.PurchaseOrders
            .AsNoTracking()
            .Where(order => visibleProjectIds.Contains(order.ProjectId)
                && order.Status == PurchaseOrderWorkflowStates.Issued)
            .CountAsync(order => order.Lines.Any(line =>
                (_db.GoodsReceipts
                    .Where(receipt => receipt.PurchaseOrderLineId == line.Id
                        && (!line.RequiresTechnicalAcceptance
                            || !receipt.TechnicalAcceptances.Any()
                            || receipt.TechnicalAcceptances
                                .OrderByDescending(review => review.ReviewSequence)
                                .Select(review => review.Outcome)
                                .FirstOrDefault() != TechnicalAcceptanceOutcomes.Rejected))
                    .Sum(receipt => (decimal?)receipt.AcceptedQuantity) ?? 0) < line.Quantity));

        var pendingInvoiceCaptureCount = await _db.PurchaseOrders
            .AsNoTracking()
            .Where(order => visibleProjectIds.Contains(order.ProjectId)
                && order.Status == PurchaseOrderWorkflowStates.Issued)
            .CountAsync(order => order.Lines.Any(line =>
                    (_db.GoodsReceipts
                        .Where(receipt => receipt.PurchaseOrderLineId == line.Id
                            && receipt.TechnicalAcceptances
                                .OrderByDescending(review => review.ReviewSequence)
                                .Select(review => review.Outcome)
                                .FirstOrDefault() != TechnicalAcceptanceOutcomes.Rejected)
                        .Sum(receipt => (decimal?)receipt.AcceptedQuantity) ?? 0) == line.Quantity)
                && !_db.SupplierInvoices.Any(invoice =>
                    invoice.PurchaseOrderId == order.Id && activeInvoiceStatuses.Contains(invoice.Status)));

        return new DashboardResponseDto
        {
            User = user,
            VisibleProjectCount = visibleProjectIds.Length,
            PendingRequisitionCount = await requisitions.CountAsync(requisition =>
                requisition.Status == "Pending"
                || requisition.Status == "AwaitingTechnicalCheck"
                || requisition.Status == "AwaitingSupervisorDecision"
                || requisition.Status == "ReturnedForRevision"),
            ApprovedRequisitionCount = await requisitions.CountAsync(requisition =>
                requisition.Status == RequisitionWorkflowStates.Approved),
            PendingAccessRequestCount = user.Role == "Administrator"
                ? await _db.AccessRequests.CountAsync(request => request.Status == "Pending")
                : 0,
            PendingSupplierOnboardingCount = await _db.SupplierOnboardingRequests.CountAsync(
                request => request.Status == SupplierOnboardingStatuses.Pending),
            PendingGoodsReceiptCount = pendingGoodsReceiptCount,
            PendingMaterialIssueCount = await requisitions.CountAsync(requisition =>
                requisition.Status == RequisitionWorkflowStates.Approved
                && requisition.RequestType == RequisitionTypes.SiteUse
                && !_db.MaterialIssues.Any(issue => issue.RequisitionId == requisition.Id)),
            PendingMaterialConfirmationCount = await _db.MaterialIssues.CountAsync(issue =>
                visibleProjectIds.Contains(issue.ProjectId)
                && issue.IssuedToUserId == userId
                && issue.Status == MaterialIssueStatuses.AwaitingConfirmation),
            PendingStockCountReviewCount = await _db.StockCounts.CountAsync(count =>
                visibleProjectIds.Contains(count.ProjectId)
                && count.Status == StockCountStatuses.AwaitingReview),
            PendingInvoiceCaptureCount = pendingInvoiceCaptureCount,
            PendingInvoiceReviewCount = await _db.SupplierInvoices.CountAsync(invoice =>
                visibleProjectIds.Contains(invoice.ProjectId)
                && invoice.Status == InvoiceStatuses.PendingReview),
            PendingCeoDecisionCount = await _db.SupplierInvoices.CountAsync(invoice =>
                visibleProjectIds.Contains(invoice.ProjectId)
                && invoice.Status == InvoiceStatuses.AwaitingCeoApproval),
            PendingPaymentAuthorizationCount = await _db.SupplierInvoices.CountAsync(invoice =>
                visibleProjectIds.Contains(invoice.ProjectId)
                && invoice.Status == InvoiceStatuses.ReadyForAuthorization),
            PendingPaymentCount = await _db.PaymentAuthorizations.CountAsync(authorization =>
                visibleProjectIds.Contains(authorization.SupplierInvoice.ProjectId)
                && !_db.Payments.Any(payment => payment.PaymentAuthorizationId == authorization.Id)),
            CompletedPaymentCount = await _db.Payments.CountAsync(payment =>
                visibleProjectIds.Contains(payment.PaymentAuthorization.SupplierInvoice.ProjectId))
        };
    }
}
