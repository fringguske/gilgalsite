namespace ConstructionMS.Infrastructure.Services.Tasks;

using System.Globalization;
using ConstructionMS.Application.Configuration;
using ConstructionMS.Application.DTOs.Tasks;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Tasks;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

/// <summary>
/// Builds the inbox directly from authoritative workflow records. Nothing in this
/// service grants action rights; command services continue to enforce RBAC and
/// segregation of duties when a user follows a task link.
/// </summary>
public sealed class MyTasksService(
    AppDbContext db,
    IActorRoleResolver roles,
    IOptions<TaskInboxOptions> options) : IMyTasksService
{
    private static readonly TimeSpan BusinessUtcOffset = TimeSpan.FromHours(3);
    private readonly TaskInboxOptions _options = options.Value;

    public async Task<MyTasksResponseDto> GetMyTasksAsync(
        int userId,
        string? requestedRole = null,
        int? projectId = null,
        bool overdueOnly = false,
        CancellationToken cancellationToken = default)
    {
        if (userId <= 0) throw new UnauthorizedAccessException("The authenticated user identity is invalid.");
        if (projectId is <= 0) throw new ArgumentException("Project ID must be positive.", nameof(projectId));

        var actor = await roles.ResolveAsync(userId, requestedRole, cancellationToken)
            ?? throw new UnauthorizedAccessException("The active account could not be verified.");

        var allProjects = actor.CanSwitchRoles || actor.EffectiveRole is "CEO" or "Auditor";
        var projectIds = allProjects
            ? await db.Projects.AsNoTracking().Select(project => project.Id).ToListAsync(cancellationToken)
            : await db.UserProjectAssignments.AsNoTracking()
                .Where(assignment => assignment.UserId == actor.UserId && assignment.IsActive)
                .Select(assignment => assignment.ProjectId)
                .ToListAsync(cancellationToken);

        if (projectId.HasValue)
        {
            if (!allProjects && !projectIds.Contains(projectId.Value))
                throw new UnauthorizedAccessException("You are not assigned to that project.");
            projectIds = projectIds.Where(id => id == projectId.Value).ToList();
        }

        var now = DateTime.UtcNow;
        var tasks = new List<MyTaskResponseDto>();
        switch (actor.EffectiveRole)
        {
            case "Administrator":
                await AddAdministratorTasksAsync(tasks, cancellationToken);
                break;
            case "CEO":
                await AddCeoTasksAsync(tasks, projectIds, cancellationToken);
                break;
            case "Supervisor":
                await AddSupervisorTasksAsync(tasks, actor.UserId, projectIds, cancellationToken);
                break;
            case "Engineer":
                await AddEngineerTasksAsync(tasks, projectIds, cancellationToken);
                break;
            case "Foreman":
                await AddForemanTasksAsync(tasks, actor.UserId, projectIds, cancellationToken);
                break;
            case "Storekeeper":
                await AddStorekeeperTasksAsync(tasks, actor.UserId, projectIds, cancellationToken);
                break;
            case "Procurement Officer":
                await AddProcurementTasksAsync(tasks, actor.UserId, projectIds, cancellationToken);
                break;
            case "Finance Officer":
                await AddFinanceTasksAsync(tasks, projectIds, cancellationToken);
                break;
            case "Auditor":
                break;
        }

        foreach (var task in tasks)
            task.IsOverdue = task.DueAt < now;

        var visible = tasks
            .Where(task => !projectId.HasValue || task.ProjectId == projectId.Value)
            .Where(task => !overdueOnly || task.IsOverdue)
            .OrderByDescending(task => task.IsOverdue)
            .ThenBy(task => task.DueAt)
            .ThenBy(task => task.TaskKey, StringComparer.Ordinal)
            .ToList();

        return new MyTasksResponseDto
        {
            GeneratedAt = now,
            ActualRole = actor.ActualRole,
            TotalCount = visible.Count,
            OverdueCount = visible.Count(task => task.IsOverdue),
            Items = visible
        };
    }

    private async Task AddAdministratorTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        CancellationToken cancellationToken)
    {
        var requests = await db.AccessRequests.AsNoTracking()
            .Where(request => request.Status == "Pending")
            .OrderBy(request => request.RequestedAt)
            .Select(request => new { request.Id, request.Username, request.RequestedAt })
            .ToListAsync(cancellationToken);
        foreach (var request in requests)
        {
            Add(tasks, $"access-review:{request.Id}", "AccessReview", "Review access request",
                request.Username, "Administrator", null, null, "AccessRequest", request.Id,
                "/access", request.RequestedAt, urgent: true);
        }
    }

    private async Task AddCeoTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var invoices = await db.SupplierInvoices.AsNoTracking()
            .Where(invoice => projectIds.Contains(invoice.ProjectId)
                && invoice.Status == InvoiceStatuses.AwaitingCeoApproval)
            .Select(invoice => new
            {
                invoice.Id,
                invoice.InvoiceNumber,
                invoice.Amount,
                invoice.ProjectId,
                ProjectName = invoice.Project.Name,
                SupplierName = invoice.Supplier.Name,
                OpenedAt = invoice.ReviewedAt ?? invoice.CapturedAt
            })
            .ToListAsync(cancellationToken);
        foreach (var invoice in invoices)
        {
            Add(tasks, $"invoice-ceo:{invoice.Id}", "CeoPaymentException", "Review payment exception",
                $"{invoice.SupplierName} · Invoice {invoice.InvoiceNumber} · KES {Money(invoice.Amount)}",
                "CEO", invoice.ProjectId, invoice.ProjectName, "SupplierInvoice", invoice.Id,
                "/finance", invoice.OpenedAt, urgent: true);
        }

        var openingPositions = await db.OpeningPositionBatches.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == OpeningPositionStatuses.AwaitingApproval)
            .Select(item => new
            {
                item.Id,
                item.BatchNumber,
                item.PositionType,
                item.SubmittedAt,
                item.ProjectId,
                ProjectName = item.Project.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in openingPositions)
        {
            Add(tasks, $"opening-position-decision:{item.Id}", "OpeningPositionDecision",
                "Review opening position", $"{item.PositionType} · {item.BatchNumber}", "CEO",
                item.ProjectId, item.ProjectName, "OpeningPositionBatch", item.Id,
                "/opening-positions", item.SubmittedAt, urgent: true);
        }

        var periods = await db.OperationalPeriods.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == OperationalPeriodStatuses.AwaitingClose)
            .Include(item => item.Project)
            .Include(item => item.Events)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var item in periods)
        {
            var latest = item.Events.OrderByDescending(entry => entry.SequenceNumber).First();
            Add(tasks, $"period-close-decision:{item.Id}:r{latest.SequenceNumber}",
                "OperationalPeriodCloseDecision", "Review period close",
                $"{item.Scope} · {item.Name}", "CEO", item.ProjectId, item.Project.Name,
                "OperationalPeriod", item.Id, "/period-close", latest.OccurredAt, urgent: true);
        }

        var corrections = await db.ControlledCorrections.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == ControlledCorrectionStatuses.AwaitingApproval)
            .Select(item => new
            {
                item.Id,
                item.CorrectionNumber,
                item.CorrectionType,
                item.SubmittedAt,
                item.ProjectId,
                ProjectName = item.Project.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in corrections)
        {
            Add(tasks, $"controlled-correction-decision:{item.Id}", "ControlledCorrectionDecision",
                "Review controlled correction", $"{item.CorrectionType} · {item.CorrectionNumber}",
                "CEO", item.ProjectId, item.ProjectName, "ControlledCorrection", item.Id,
                "/period-close", item.SubmittedAt, urgent: true);
        }
    }

    private async Task AddSupervisorTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        int userId,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var requisitions = await db.Requisitions.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == RequisitionWorkflowStates.AwaitingSupervisorDecision)
            .Select(item => new
            {
                item.Id,
                item.WorkflowRevision,
                item.Quantity,
                item.UpdatedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit
            })
            .ToListAsync(cancellationToken);
        foreach (var item in requisitions)
        {
            Add(tasks, $"requisition-supervisor:{item.Id}:r{item.WorkflowRevision}",
                "RequisitionApproval", "Decide material request",
                $"{Quantity(item.Quantity)} {item.Unit} of {item.MaterialName}", "Supervisor",
                item.ProjectId, item.ProjectName, "Requisition", item.Id, "/requisitions", item.UpdatedAt);
        }

        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == PurchaseOrderWorkflowStates.Submitted)
            .Select(item => new
            {
                item.Id,
                item.PurchaseOrderNumber,
                item.ProjectId,
                ProjectName = item.Project.Name,
                SupplierName = item.Supplier.Name,
                OpenedAt = item.SubmittedAt ?? item.CreatedAt
            })
            .ToListAsync(cancellationToken);
        foreach (var item in orders)
        {
            Add(tasks, $"po-approval:{item.Id}:{item.OpenedAt.Ticks}", "PurchaseOrderApproval",
                "Review purchase order", $"{item.SupplierName} · {item.PurchaseOrderNumber}", "Supervisor",
                item.ProjectId, item.ProjectName, "PurchaseOrder", item.Id, "/purchase-orders", item.OpenedAt);
        }

        var invoices = await db.SupplierInvoices.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == InvoiceStatuses.ReadyForAuthorization)
            .Select(item => new
            {
                item.Id,
                item.InvoiceNumber,
                item.Amount,
                item.ProjectId,
                ProjectName = item.Project.Name,
                SupplierName = item.Supplier.Name,
                OpenedAt = item.CeoDecisionAt ?? item.ReviewedAt ?? item.CapturedAt
            })
            .ToListAsync(cancellationToken);
        foreach (var item in invoices)
        {
            Add(tasks, $"payment-authorization:{item.Id}", "PaymentAuthorization",
                "Authorize supplier payment",
                $"{item.SupplierName} · Invoice {item.InvoiceNumber} · KES {Money(item.Amount)}",
                "Supervisor", item.ProjectId, item.ProjectName, "SupplierInvoice", item.Id,
                "/finance", item.OpenedAt, urgent: true);
        }

        var counts = await db.StockCounts.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == StockCountStatuses.AwaitingReview)
            .Select(item => new
            {
                item.Id,
                item.CountNumber,
                item.Variance,
                item.CountedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit
            })
            .ToListAsync(cancellationToken);
        foreach (var item in counts)
        {
            Add(tasks, $"stock-count-review:{item.Id}", "StockCountReview", "Review stock count",
                $"{item.MaterialName} · variance {Quantity(item.Variance)} {item.Unit}", "Supervisor",
                item.ProjectId, item.ProjectName, "StockCount", item.Id, "/inventory", item.CountedAt);
        }

        var openingStock = await db.OpeningPositionBatches.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.PositionType == OpeningPositionTypes.Inventory
                && item.Status == OpeningPositionStatuses.AwaitingVerification)
            .Select(item => new
            {
                item.Id,
                item.BatchNumber,
                item.SubmittedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialCount = item.InventoryLines.Count
            })
            .ToListAsync(cancellationToken);
        foreach (var item in openingStock)
        {
            Add(tasks, $"opening-stock-verification:{item.Id}", "OpeningStockVerification",
                "Verify opening stock",
                $"{item.MaterialCount} material{(item.MaterialCount == 1 ? string.Empty : "s")} · {item.BatchNumber}",
                "Supervisor", item.ProjectId, item.ProjectName, "OpeningPositionBatch", item.Id,
                "/opening-positions", item.SubmittedAt, urgent: true);
        }

        var disputedHandovers = await db.MaterialIssues.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == MaterialIssueStatuses.Disputed)
            .Select(item => new
            {
                item.Id,
                item.IssueNumber,
                item.QuantityIssued,
                item.ConfirmedQuantity,
                OpenedAt = item.ConfirmedAt ?? item.IssuedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit,
                ForemanName = item.IssuedToUser.FullName
            })
            .ToListAsync(cancellationToken);
        foreach (var item in disputedHandovers)
        {
            Add(tasks, $"material-handover-dispute:{item.Id}", "MaterialHandoverDispute",
                "Resolve material handover difference",
                $"{item.MaterialName} · issued {Quantity(item.QuantityIssued)} {item.Unit}, "
                    + $"{item.ForemanName} received {Quantity(item.ConfirmedQuantity ?? 0)} {item.Unit}",
                "Supervisor", item.ProjectId, item.ProjectName, "MaterialIssue", item.Id,
                "/custody-close-out", item.OpenedAt, urgent: true);
        }

        var closeouts = await db.MaterialCustodyCloseouts.AsNoTracking()
            .Where(item => projectIds.Contains(item.MaterialIssue.ProjectId)
                && item.Status == CustodyCloseoutStatuses.AwaitingReview)
            .Select(item => new
            {
                item.Id,
                item.CloseoutNumber,
                item.SubmittedAt,
                ProjectId = item.MaterialIssue.ProjectId,
                ProjectName = item.MaterialIssue.Project.Name,
                MaterialName = item.MaterialIssue.Material.Name,
                Unit = item.MaterialIssue.Material.Unit,
                item.ConfirmedQuantity
            })
            .ToListAsync(cancellationToken);
        foreach (var item in closeouts)
        {
            Add(tasks, $"custody-closeout-review:{item.Id}", "CustodyCloseoutReview",
                "Review material custody close-out",
                $"{Quantity(item.ConfirmedQuantity)} {item.Unit} of {item.MaterialName} · {item.CloseoutNumber}",
                "Supervisor", item.ProjectId, item.ProjectName, "MaterialCustodyCloseout", item.Id,
                "/custody-close-out", item.SubmittedAt, urgent: true);
        }

        await AddPeriodSubmissionTasksAsync(
            tasks, "Supervisor", OperationalPeriodScopes.Inventory, projectIds, cancellationToken);

        var pettyCash = await db.PettyCashRequests.AsNoTracking()
            .Where(item => item.RequestedByUserId == userId
                && projectIds.Contains(item.ProjectId)
                && item.Status == PettyCashStatuses.Disbursed)
            .Include(item => item.Project)
            .Include(item => item.Disbursement)
            .Include(item => item.ReceiptConfirmation)
            .Include(item => item.Reconciliations)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var item in pettyCash)
        {
            if (item.Disbursement is null) continue;
            if (item.ReceiptConfirmation is null)
            {
                Add(tasks, $"petty-receipt:{item.Id}", "PettyCashReceipt", "Confirm petty cash received",
                    $"{item.Purpose} · KES {Money(item.Disbursement.Amount)}", "Supervisor",
                    item.ProjectId, item.Project.Name, "PettyCashRequest", item.Id,
                    "/petty-cash", item.Disbursement.DisbursedAt, handover: true);
                continue;
            }

            var latest = item.Reconciliations.OrderByDescending(entry => entry.SubmittedAt).FirstOrDefault();
            if (latest?.Status != PettyCashReconciliationStatuses.Approved)
            {
                var revision = latest?.Id ?? 0;
                var openedAt = latest?.ReviewedAt ?? item.ReceiptConfirmation.ConfirmedAt;
                Add(tasks, $"petty-accountability:{item.Id}:r{revision}", "PettyCashAccountability",
                    "Submit petty cash accountability", item.Purpose, "Supervisor",
                    item.ProjectId, item.Project.Name, "PettyCashRequest", item.Id,
                    "/petty-cash", openedAt, urgent: true);
            }
        }
    }

    private async Task AddEngineerTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var requisitions = await db.Requisitions.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.RequestType == RequisitionTypes.SiteUse
                && item.Status == RequisitionWorkflowStates.AwaitingTechnicalCheck)
            .Select(item => new
            {
                item.Id,
                item.WorkflowRevision,
                item.Quantity,
                item.Purpose,
                item.UpdatedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit
            })
            .ToListAsync(cancellationToken);
        foreach (var item in requisitions)
        {
            Add(tasks, $"requisition-engineer:{item.Id}:r{item.WorkflowRevision}",
                "RequisitionTechnicalCheck", "Check material request",
                $"{Quantity(item.Quantity)} {item.Unit} of {item.MaterialName} · {item.Purpose}",
                "Engineer", item.ProjectId, item.ProjectName, "Requisition", item.Id,
                "/requisitions", item.UpdatedAt);
        }

        var receipts = await db.GoodsReceipts.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.AcceptedQuantity > 0
                && item.PurchaseOrderLine.RequiresTechnicalAcceptance)
            .Include(item => item.Project)
            .Include(item => item.Material)
            .Include(item => item.PurchaseOrderLine)
            .Include(item => item.PurchaseOrder).ThenInclude(order => order.Supplier)
            .Include(item => item.TechnicalAcceptances)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        var postedReceiptIds = new HashSet<long>(await db.StockLedgerEntries.AsNoTracking()
            .Where(entry => entry.MovementType == "Receipt"
                && entry.ReferenceType == "GoodsReceipt"
                && entry.QuantityDelta > 0)
            .Select(entry => entry.ReferenceId)
            .ToListAsync(cancellationToken));
        var technicallyAcceptedByLine = receipts
            .Where(item => LatestTechnicalAcceptance(item)?.Outcome == TechnicalAcceptanceOutcomes.Accepted)
            .GroupBy(item => item.PurchaseOrderLineId)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.AcceptedQuantity));
        foreach (var item in receipts.Where(item => !postedReceiptIds.Contains(item.Id)))
        {
            var latest = LatestTechnicalAcceptance(item);
            if (latest?.Outcome == TechnicalAcceptanceOutcomes.Accepted) continue;
            if (technicallyAcceptedByLine.GetValueOrDefault(item.PurchaseOrderLineId)
                >= item.PurchaseOrderLine.Quantity)
                continue;
            var sequence = (latest?.ReviewSequence ?? 0) + 1;
            Add(tasks, $"delivery-acceptance:{item.Id}:r{sequence}", "DeliveryTechnicalAcceptance",
                latest?.Outcome == TechnicalAcceptanceOutcomes.Rejected
                    ? "Recheck delivered material"
                    : "Check delivered material",
                $"{Quantity(item.AcceptedQuantity)} {item.Material.Unit} of {item.Material.Name} · {item.PurchaseOrder.Supplier.Name}",
                "Engineer", item.ProjectId, item.Project.Name, "GoodsReceipt", item.Id,
                "/delivery-checks", latest?.ReviewedAt ?? item.ReceivedAt, urgent: true);
        }
    }

    private async Task AddForemanTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        int userId,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var returned = await db.Requisitions.AsNoTracking()
            .Where(item => item.RequestedByUserId == userId
                && projectIds.Contains(item.ProjectId)
                && item.Status == RequisitionWorkflowStates.ReturnedForRevision)
            .Select(item => new
            {
                item.Id,
                item.WorkflowRevision,
                item.UpdatedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in returned)
        {
            Add(tasks, $"requisition-revise:{item.Id}:r{item.WorkflowRevision}", "RequisitionRevision",
                "Revise material request", item.MaterialName, "Foreman", item.ProjectId,
                item.ProjectName, "Requisition", item.Id, "/requisitions", item.UpdatedAt);
        }

        var issues = await db.MaterialIssues.AsNoTracking()
            .Where(item => item.IssuedToUserId == userId && projectIds.Contains(item.ProjectId)
                && (item.Status == MaterialIssueStatuses.AwaitingConfirmation
                    || item.Status == MaterialIssueStatuses.Confirmed))
            .Include(item => item.Project)
            .Include(item => item.Material)
            .Include(item => item.UsageRecords)
            .Include(item => item.Returns)
            .Include(item => item.MaterialCustodyCloseouts).ThenInclude(entry => entry.Decision)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var item in issues)
        {
            if (item.Status == MaterialIssueStatuses.AwaitingConfirmation)
            {
                Add(tasks, $"material-handover:{item.Id}", "MaterialHandoverConfirmation",
                    "Confirm materials received",
                    $"{Quantity(item.QuantityIssued)} {item.Material.Unit} of {item.Material.Name}", "Foreman",
                    item.ProjectId, item.Project.Name, "MaterialIssue", item.Id,
                    "/inventory", item.IssuedAt, handover: true);
                continue;
            }

            var accounted = item.UsageRecords.Sum(record => record.Quantity)
                + item.Returns
                    .Where(entry => entry.Status == MaterialReturnStatuses.Received)
                    .Sum(entry => entry.QuantityAccepted ?? 0);
            var pendingReturn = item.Returns
                .Where(entry => entry.Status == MaterialReturnStatuses.AwaitingReceipt)
                .Sum(entry => entry.QuantityOffered);
            var confirmed = item.ConfirmedQuantity ?? 0;
            var available = confirmed - accounted - pendingReturn;
            if (available > 0)
            {
                Add(tasks, $"material-accountability:{item.Id}", "MaterialAccountability",
                    "Record material use",
                    $"{Quantity(available)} {item.Material.Unit} of {item.Material.Name} remaining",
                    "Foreman", item.ProjectId, item.Project.Name, "MaterialIssue", item.Id,
                    "/inventory", item.ConfirmedAt ?? item.IssuedAt);
                continue;
            }

            var latestCloseout = item.MaterialCustodyCloseouts
                .OrderByDescending(entry => entry.Revision)
                .FirstOrDefault();
            if (pendingReturn > 0
                || latestCloseout?.Status is CustodyCloseoutStatuses.AwaitingReview
                    or CustodyCloseoutStatuses.Approved)
                continue;

            var revision = (latestCloseout?.Revision ?? 0) + 1;
            Add(tasks, $"custody-closeout-submit:{item.Id}:r{revision}", "CustodyCloseoutSubmission",
                latestCloseout?.Status == CustodyCloseoutStatuses.Returned
                    ? "Resubmit material custody close-out"
                    : "Submit material custody close-out",
                $"{Quantity(confirmed)} {item.Material.Unit} of {item.Material.Name}", "Foreman",
                item.ProjectId, item.Project.Name, "MaterialIssue", item.Id,
                "/custody-close-out", latestCloseout?.Decision?.DecidedAt
                    ?? item.ConfirmedAt ?? item.IssuedAt, urgent: true);
        }
    }

    private async Task AddStorekeeperTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        int userId,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var issueRequests = await db.Requisitions.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.RequestType == RequisitionTypes.SiteUse
                && item.Status == RequisitionWorkflowStates.Approved
                && !db.MaterialIssues.Any(issue => issue.RequisitionId == item.Id)
                && db.StockBalances.Any(balance => balance.ProjectId == item.ProjectId
                    && balance.MaterialId == item.MaterialId
                    && balance.QuantityOnHand >= item.Quantity))
            .Select(item => new
            {
                item.Id,
                item.Quantity,
                OpenedAt = item.ApprovedAt ?? item.UpdatedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit,
                ForemanName = item.RequestedByUser.FullName
            })
            .ToListAsync(cancellationToken);
        foreach (var item in issueRequests)
        {
            Add(tasks, $"material-issue:{item.Id}", "MaterialIssue", "Issue approved materials",
                $"{Quantity(item.Quantity)} {item.Unit} of {item.MaterialName} to {item.ForemanName}",
                "Storekeeper", item.ProjectId, item.ProjectName, "Requisition", item.Id,
                "/inventory", item.OpenedAt, urgent: true);
        }

        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == PurchaseOrderWorkflowStates.Issued)
            .Include(item => item.Project)
            .Include(item => item.Supplier)
            .Include(item => item.Lines).ThenInclude(line => line.Material)
            .Include(item => item.GoodsReceipts).ThenInclude(receipt => receipt.TechnicalAcceptances)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var order in orders)
        {
            var line = PurchaseOrderInvariant.RequireSingleLine(order);
            var committed = order.GoodsReceipts
                .Where(receipt => receipt.AcceptedQuantity > 0
                    && LatestTechnicalAcceptance(receipt)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
                .Sum(receipt => receipt.AcceptedQuantity);
            var remaining = line.Quantity - committed;
            if (remaining <= 0) continue;
            var revision = order.GoodsReceipts.Count
                + order.GoodsReceipts.Sum(receipt => receipt.TechnicalAcceptances.Count);
            var openedAt = order.GoodsReceipts
                .SelectMany(receipt => receipt.TechnicalAcceptances.Select(review => review.ReviewedAt)
                    .Append(receipt.ReceivedAt))
                .DefaultIfEmpty(order.IssuedAt ?? order.ApprovedAt ?? order.CreatedAt)
                .Max();
            Add(tasks, $"goods-receipt:{order.Id}:r{revision}", "GoodsReceipt",
                "Receive supplier delivery",
                $"{Quantity(remaining)} {line.Material.Unit} of {line.Material.Name} · {order.Supplier.Name}",
                "Storekeeper", order.ProjectId, order.Project.Name, "PurchaseOrder", order.Id,
                "/inventory", openedAt, urgent: true);
        }

        var transfers = await db.StockTransfers.AsNoTracking()
            .Where(item => (item.Status == StockTransferStatuses.PendingDispatch
                    && projectIds.Contains(item.FromProjectId))
                || (item.Status == StockTransferStatuses.InTransit
                    && projectIds.Contains(item.ToProjectId)
                    && item.DispatchedByUserId != userId))
            .Include(item => item.FromProject)
            .Include(item => item.ToProject)
            .Include(item => item.Material)
            .ToListAsync(cancellationToken);
        foreach (var item in transfers)
        {
            var receive = item.Status == StockTransferStatuses.InTransit;
            Add(tasks, $"stock-transfer-{(receive ? "receive" : "dispatch")}:{item.Id}",
                receive ? "StockTransferReceipt" : "StockTransferDispatch",
                receive ? "Receive stock transfer" : "Dispatch stock transfer",
                $"{Quantity(item.Quantity)} {item.Material.Unit} of {item.Material.Name} · {item.FromProject.Name} to {item.ToProject.Name}",
                "Storekeeper", receive ? item.ToProjectId : item.FromProjectId,
                receive ? item.ToProject.Name : item.FromProject.Name, "StockTransfer", item.Id,
                "/inventory", receive ? item.DispatchedAt ?? item.RequestedAt : item.RequestedAt, urgent: true);
        }

        var returns = await db.MaterialReturns.AsNoTracking()
            .Where(item => projectIds.Contains(item.MaterialIssue.ProjectId)
                && item.Status == MaterialReturnStatuses.AwaitingReceipt
                && item.ReturnedByUserId != userId)
            .Select(item => new
            {
                item.Id,
                item.ReturnNumber,
                item.QuantityOffered,
                item.ReturnedAt,
                ProjectId = item.MaterialIssue.ProjectId,
                ProjectName = item.MaterialIssue.Project.Name,
                MaterialName = item.MaterialIssue.Material.Name,
                Unit = item.MaterialIssue.Material.Unit,
                ForemanName = item.ReturnedByUser.FullName
            })
            .ToListAsync(cancellationToken);
        foreach (var item in returns)
        {
            Add(tasks, $"material-return-receive:{item.Id}", "MaterialReturnReceipt",
                "Receive returned material",
                $"{Quantity(item.QuantityOffered)} {item.Unit} of {item.MaterialName} from {item.ForemanName}",
                "Storekeeper", item.ProjectId, item.ProjectName, "MaterialReturn", item.Id,
                "/custody-close-out", item.ReturnedAt, handover: true);
        }
    }

    private async Task AddProcurementTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        int userId,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var materialCatalogRequests = await db.MaterialCatalogRequests.AsNoTracking()
            .Where(item => item.Status == MaterialCatalogRequestStatuses.Pending
                && projectIds.Contains(item.ProjectId))
            .Select(item => new
            {
                item.Id,
                item.Name,
                item.Unit,
                item.SubmittedAt,
                item.ProjectId,
                ProjectName = item.Project.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in materialCatalogRequests)
        {
            Add(tasks, $"material-catalog-review:{item.Id}", "MaterialCatalogReview",
                "Review material", $"{item.Name} · {item.Unit}", "Procurement Officer",
                item.ProjectId, item.ProjectName, "MaterialCatalogRequest", item.Id,
                "/sourcing", item.SubmittedAt);
        }

        var liveOrderStatuses = new[]
        {
            PurchaseOrderWorkflowStates.Draft,
            PurchaseOrderWorkflowStates.Submitted,
            PurchaseOrderWorkflowStates.Approved,
            PurchaseOrderWorkflowStates.Issued
        };
        var requisitions = await db.Requisitions.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == RequisitionWorkflowStates.Approved
                && !db.PurchaseOrders.Any(order => order.RequisitionId == item.Id
                    && liveOrderStatuses.Contains(order.Status))
                && !db.SourcingRounds.Any(round => round.RequisitionId == item.Id
                    && round.Status == SourcingRoundWorkflowStates.Open)
                && (item.RequestType == RequisitionTypes.StockReplenishment
                    || !db.StockBalances.Any(balance => balance.ProjectId == item.ProjectId
                        && balance.MaterialId == item.MaterialId
                        && balance.QuantityOnHand >= item.Quantity)))
            .Select(item => new
            {
                item.Id,
                item.Quantity,
                OpenedAt = item.ApprovedAt ?? item.UpdatedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                MaterialName = item.Material.Name,
                Unit = item.Material.Unit
            })
            .ToListAsync(cancellationToken);
        foreach (var item in requisitions)
        {
            Add(tasks, $"open-sourcing:{item.Id}", "OpenSourcing", "Open supplier sourcing",
                $"{Quantity(item.Quantity)} {item.Unit} of {item.MaterialName}", "Procurement Officer",
                item.ProjectId, item.ProjectName, "Requisition", item.Id, "/sourcing", item.OpenedAt);
        }

        var rounds = await db.SourcingRounds.AsNoTracking()
            .Where(item => projectIds.Contains(item.Requisition.ProjectId)
                && item.Status == SourcingRoundWorkflowStates.Open)
            .Select(item => new
            {
                item.Id,
                item.CreatedAt,
                item.QuoteDueAt,
                item.Requisition.ProjectId,
                ProjectName = item.Requisition.Project.Name,
                MaterialName = item.Requisition.Material.Name,
                QuoteCount = item.Quotes.Count
            })
            .ToListAsync(cancellationToken);
        foreach (var item in rounds)
        {
            Add(tasks, $"complete-sourcing:{item.Id}", "CompleteSourcing", "Complete supplier sourcing",
                $"{item.MaterialName} · {item.QuoteCount} quotation{(item.QuoteCount == 1 ? string.Empty : "s")}",
                "Procurement Officer", item.ProjectId, item.ProjectName, "SourcingRound", item.Id,
                "/sourcing", item.CreatedAt, dueAt: item.QuoteDueAt);
        }

        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && ((item.Status == PurchaseOrderWorkflowStates.Draft && item.CreatedByUserId == userId)
                    || item.Status == PurchaseOrderWorkflowStates.Approved))
            .Select(item => new
            {
                item.Id,
                item.Status,
                item.PurchaseOrderNumber,
                item.CreatedAt,
                item.ApprovedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                SupplierName = item.Supplier.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in orders)
        {
            var issue = item.Status == PurchaseOrderWorkflowStates.Approved;
            Add(tasks, $"po-{(issue ? "issue" : "draft")}:{item.Id}",
                issue ? "IssuePurchaseOrder" : "SubmitPurchaseOrder",
                issue ? "Send purchase order" : "Approve purchase order",
                $"{item.SupplierName} · {item.PurchaseOrderNumber}", "Procurement Officer",
                item.ProjectId, item.ProjectName, "PurchaseOrder", item.Id,
                "/purchase-orders", issue ? item.ApprovedAt ?? item.CreatedAt : item.CreatedAt);
        }

        var activeInvoiceStatuses = new[]
        {
            InvoiceStatuses.PendingReview,
            InvoiceStatuses.Matched,
            InvoiceStatuses.AwaitingCeoApproval,
            InvoiceStatuses.ReadyForAuthorization,
            InvoiceStatuses.Authorized,
            InvoiceStatuses.Paid
        };
        var invoiceOrders = await db.PurchaseOrders.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == PurchaseOrderWorkflowStates.Issued
                && !db.SupplierInvoices.Any(invoice => invoice.PurchaseOrderId == item.Id
                    && activeInvoiceStatuses.Contains(invoice.Status)))
            .Include(item => item.Project)
            .Include(item => item.Supplier)
            .Include(item => item.Lines).ThenInclude(line => line.Material)
            .Include(item => item.GoodsReceipts).ThenInclude(receipt => receipt.TechnicalAcceptances)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var order in invoiceOrders)
        {
            var line = PurchaseOrderInvariant.RequireSingleLine(order);
            var eligible = order.GoodsReceipts
                .Where(receipt => receipt.AcceptedQuantity > 0
                    && LatestTechnicalAcceptance(receipt)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
                .Sum(receipt => receipt.AcceptedQuantity);
            var openedAt = order.GoodsReceipts.Select(receipt => receipt.ReceivedAt)
                .DefaultIfEmpty(order.IssuedAt ?? order.CreatedAt).Max();
            Add(tasks, $"capture-invoice:{order.Id}", "CaptureSupplierInvoice", "Capture supplier invoice",
                $"{order.Supplier.Name} · {line.Material.Name}", "Procurement Officer",
                order.ProjectId, order.Project.Name, "PurchaseOrder", order.Id,
                "/finance", openedAt, urgent: true);
        }
    }

    private async Task AddFinanceTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var suppliers = await db.SupplierOnboardingRequests.AsNoTracking()
            .Where(item => item.Status == SupplierOnboardingStatuses.Pending)
            .Select(item => new { item.Id, item.Name, item.RequestNumber, item.SubmittedAt })
            .ToListAsync(cancellationToken);
        foreach (var item in suppliers)
        {
            Add(tasks, $"supplier-onboarding:{item.Id}", "SupplierOnboardingReview",
                "Review supplier application", $"{item.Name} · {item.RequestNumber}", "Finance Officer",
                null, null, "SupplierOnboardingRequest", item.Id, "/suppliers", item.SubmittedAt);
        }

        var invoices = await db.SupplierInvoices.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Status == InvoiceStatuses.PendingReview)
            .Select(item => new
            {
                item.Id,
                item.InvoiceNumber,
                item.Amount,
                item.CapturedAt,
                item.ProjectId,
                ProjectName = item.Project.Name,
                SupplierName = item.Supplier.Name
            })
            .ToListAsync(cancellationToken);
        foreach (var item in invoices)
        {
            Add(tasks, $"invoice-match:{item.Id}", "InvoiceMatch", "Run invoice match",
                $"{item.SupplierName} · Invoice {item.InvoiceNumber} · KES {Money(item.Amount)}",
                "Finance Officer", item.ProjectId, item.ProjectName, "SupplierInvoice", item.Id,
                "/finance", item.CapturedAt, urgent: true);
        }

        var authorizations = await db.PaymentAuthorizations.AsNoTracking()
            .Where(item => projectIds.Contains(item.SupplierInvoice.ProjectId)
                && !db.Payments.Any(payment => payment.PaymentAuthorizationId == item.Id))
            .Select(item => new
            {
                item.Id,
                item.Amount,
                item.AuthorizedAt,
                item.SupplierInvoice.ProjectId,
                ProjectName = item.SupplierInvoice.Project.Name,
                SupplierName = item.SupplierInvoice.Supplier.Name,
                item.SupplierInvoice.InvoiceNumber
            })
            .ToListAsync(cancellationToken);
        foreach (var item in authorizations)
        {
            Add(tasks, $"payment-execute:{item.Id}", "PaymentExecution", "Pay authorized supplier",
                $"{item.SupplierName} · Invoice {item.InvoiceNumber} · KES {Money(item.Amount)}",
                "Finance Officer", item.ProjectId, item.ProjectName, "PaymentAuthorization", item.Id,
                "/finance", item.AuthorizedAt, urgent: true);
        }

        var pettyCash = await db.PettyCashRequests.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && (item.Status == PettyCashStatuses.PendingFinanceApproval
                    || item.Status == PettyCashStatuses.Approved
                    || item.Status == PettyCashStatuses.ReconciliationSubmitted))
            .Include(item => item.Project)
            .Include(item => item.Reconciliations)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var item in pettyCash)
        {
            if (item.Status == PettyCashStatuses.PendingFinanceApproval)
            {
                Add(tasks, $"petty-decision:{item.Id}", "PettyCashDecision", "Review petty cash request",
                    $"{item.Purpose} · KES {Money(item.AmountRequested)}", "Finance Officer",
                    item.ProjectId, item.Project.Name, "PettyCashRequest", item.Id,
                    "/petty-cash", item.RequestedAt, urgent: true);
            }
            else if (item.Status == PettyCashStatuses.Approved)
            {
                Add(tasks, $"petty-disburse:{item.Id}", "PettyCashDisbursement", "Disburse petty cash",
                    $"{item.Purpose} · KES {Money(item.AmountApproved ?? item.AmountRequested)}", "Finance Officer",
                    item.ProjectId, item.Project.Name, "PettyCashRequest", item.Id,
                    "/petty-cash", item.FinanceDecisionAt ?? item.RequestedAt, urgent: true);
            }
            else
            {
                var pending = item.Reconciliations.Single(entry =>
                    entry.Status == PettyCashReconciliationStatuses.PendingReview);
                Add(tasks, $"petty-reconciliation:{pending.Id}", "PettyCashReconciliationReview",
                    "Review petty cash accountability", item.Purpose, "Finance Officer",
                    item.ProjectId, item.Project.Name, "PettyCashReconciliation", pending.Id,
                "/petty-cash", pending.SubmittedAt, urgent: true);
            }
        }

        await AddPeriodSubmissionTasksAsync(
            tasks, "Finance Officer", OperationalPeriodScopes.Finance, projectIds, cancellationToken);
    }

    private async Task AddPeriodSubmissionTasksAsync(
        ICollection<MyTaskResponseDto> tasks,
        string requiredRole,
        string scope,
        IReadOnlyCollection<int> projectIds,
        CancellationToken cancellationToken)
    {
        var today = BusinessToday();
        var periods = await db.OperationalPeriods.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId)
                && item.Scope == scope
                && (item.Status == OperationalPeriodStatuses.Open
                    || item.Status == OperationalPeriodStatuses.Returned)
                && item.EndDate < today)
            .Include(item => item.Project)
            .Include(item => item.Events)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        foreach (var item in periods)
        {
            var latest = item.Events.OrderByDescending(entry => entry.SequenceNumber).First();
            var openedAt = item.Status == OperationalPeriodStatuses.Returned
                ? latest.OccurredAt
                : BusinessDayEndExclusiveUtc(item.EndDate);
            Add(tasks, $"period-close-submit:{item.Id}:r{latest.SequenceNumber}",
                "OperationalPeriodCloseSubmission",
                item.Status == OperationalPeriodStatuses.Returned
                    ? "Resubmit period close"
                    : "Submit period close",
                $"{item.Scope} · {item.Name}", requiredRole, item.ProjectId, item.Project.Name,
                "OperationalPeriod", item.Id, "/period-close", openedAt, urgent: true);
        }
    }

    private void Add(
        ICollection<MyTaskResponseDto> tasks,
        string key,
        string type,
        string title,
        string detail,
        string requiredRole,
        int? projectId,
        string? projectName,
        string sourceType,
        long sourceId,
        string targetPath,
        DateTime openedAt,
        bool urgent = false,
        bool handover = false,
        DateTime? dueAt = null)
    {
        var hours = handover
            ? PositiveHours(_options.HandoverDueHours, 12)
            : urgent
                ? PositiveHours(_options.UrgentDueHours, 24)
                : PositiveHours(_options.DefaultDueHours, 48);
        tasks.Add(new MyTaskResponseDto
        {
            TaskKey = key,
            TaskType = type,
            Title = title,
            Detail = detail,
            RequiredRole = requiredRole,
            ProjectId = projectId,
            ProjectName = projectName,
            SourceEntityType = sourceType,
            SourceEntityId = sourceId,
            TargetPath = targetPath,
            OpenedAt = openedAt,
            DueAt = dueAt ?? openedAt.AddHours(hours),
            Priority = urgent || handover ? "High" : "Normal"
        });
    }

    private static GoodsReceiptTechnicalAcceptance? LatestTechnicalAcceptance(GoodsReceipt receipt) =>
        receipt.TechnicalAcceptances
            .OrderByDescending(review => review.ReviewSequence)
            .FirstOrDefault();

    private static int PositiveHours(int configured, int fallback) => configured > 0 ? configured : fallback;
    private static string Money(decimal amount) => amount.ToString("N2", CultureInfo.InvariantCulture);
    private static string Quantity(decimal amount) => amount.ToString("0.###", CultureInfo.InvariantCulture);
    private static DateOnly BusinessToday() =>
        DateOnly.FromDateTime(DateTime.UtcNow + BusinessUtcOffset);
    private static DateTime BusinessDayEndExclusiveUtc(DateOnly date) =>
        new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), BusinessUtcOffset).UtcDateTime;

}
