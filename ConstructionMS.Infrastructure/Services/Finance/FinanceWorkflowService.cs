namespace ConstructionMS.Infrastructure.Services.Finance;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Finance;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Finance;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using ConstructionMS.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Text.Json;

public sealed class FinanceWorkflowService : IFinanceWorkflowService
{
    public const decimal CeoExceptionThreshold = 500_000m;
    private static readonly string[] ActiveInvoiceStatuses =
    [
        InvoiceStatuses.PendingReview, InvoiceStatuses.Matched, InvoiceStatuses.AwaitingCeoApproval,
        InvoiceStatuses.ReadyForAuthorization, InvoiceStatuses.Authorized, InvoiceStatuses.Paid
    ];

    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _roles;
    private readonly ControlEventWriter _events;

    public FinanceWorkflowService(AppDbContext db, IActorRoleResolver roles)
    {
        _db = db;
        _roles = roles;
        _events = new ControlEventWriter(db);
    }

    public async Task<PaginatedResult<SupplierInvoiceResponseDto>> GetInvoicesAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, string? status = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Procurement Officer", "Supervisor", "Finance Officer", "CEO", "Auditor");
        var query = _db.SupplierInvoices.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status.Trim());
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await InvoiceQuery(query).OrderByDescending(item => item.CapturedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<SupplierInvoiceResponseDto> CreateInvoiceAsync(
        CreateSupplierInvoiceRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Procurement Officer");
        var invoiceNumber = InputNormalizer.RequiredText(request.InvoiceNumber, nameof(request.InvoiceNumber), maximumLength: 100).ToUpperInvariant();
        var quantity = InputNormalizer.Positive(request.Quantity, nameof(request.Quantity), 18, 3);
        var unitPrice = InputNormalizer.Positive(request.UnitPrice, nameof(request.UnitPrice), 18, 2);
        var amount = InputNormalizer.Positive(request.Amount, nameof(request.Amount), 18, 2);
        var document = InputNormalizer.OptionalText(request.DocumentReference, nameof(request.DocumentReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var order = await _db.PurchaseOrders.Include(item => item.Lines).Include(item => item.Requisition)
            .SingleOrDefaultAsync(item => item.Id == request.PurchaseOrderId)
            ?? throw new KeyNotFoundException("The purchase order was not found.");
        if (order.Status != PurchaseOrderWorkflowStates.Issued) throw new InvalidOperationException("An invoice can be captured only for an issued purchase order.");
        await RequireProjectAccessAsync(actorUserId, order.ProjectId);
        var line = PurchaseOrderInvariant.RequireSingleLine(order);
        var receipts = await _db.GoodsReceipts
            .Where(item => item.PurchaseOrderId == order.Id)
            .Include(item => item.TechnicalAcceptances)
            .ToListAsync();
        var acceptedQuantity = QuantityEligibleForInvoice(line, receipts);
        if (acceptedQuantity != line.Quantity)
            throw new InvalidOperationException(
                "The full purchase-order quantity must be accepted by Stores before its supplier invoice can enter Finance review.");
        if (await _db.SupplierInvoices.AnyAsync(item => item.PurchaseOrderId == order.Id && ActiveInvoiceStatuses.Contains(item.Status)))
            throw new InvalidOperationException("This purchase order already has a live supplier invoice.");
        if (await _db.SupplierInvoices.AnyAsync(item => item.SupplierId == order.SupplierId && item.InvoiceNumber == invoiceNumber))
            throw new InvalidOperationException("That supplier invoice number is already recorded.");
        var now = DateTime.UtcNow;
        var invoice = new SupplierInvoice
        {
            InvoiceNumber = invoiceNumber, PurchaseOrderId = order.Id, ProjectId = order.ProjectId,
            SupplierId = order.SupplierId, Quantity = quantity, UnitPrice = unitPrice, Amount = amount,
            DocumentReference = document, CapturedByUserId = actorUserId, CapturedAt = now, Status = InvoiceStatuses.PendingReview
        };
        _db.SupplierInvoices.Add(invoice);
        await _db.SaveChangesAsync();
        await _events.AppendAsync(Chain(order.RequisitionId), order.RequisitionId, order.ProjectId, "SupplierInvoice", invoice.Id,
            invoice.InvoiceNumber, "InvoiceCaptured", actorUserId, actorRole, new { quantity, unitPrice, amount, document }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadInvoiceAsync(invoice.Id);
    }

    public async Task<SupplierInvoiceResponseDto> ReviewInvoiceAsync(
        long id, ReviewInvoiceRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Finance Officer");
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var invoice = await _db.SupplierInvoices
            .Include(item => item.PurchaseOrder).ThenInclude(order => order.Lines)
            .Include(item => item.PurchaseOrder).ThenInclude(order => order.GoodsReceipts)
                .ThenInclude(receipt => receipt.TechnicalAcceptances)
            .SingleOrDefaultAsync(item => item.Id == id) ?? throw new KeyNotFoundException("The supplier invoice was not found.");
        if (invoice.Status != InvoiceStatuses.PendingReview) throw new InvalidOperationException("Only a pending invoice can be matched.");
        if (invoice.CapturedByUserId == actorUserId) throw new UnauthorizedAccessException("The invoice capturer cannot perform the independent Finance match.");
        await RequireProjectAccessAsync(actorUserId, invoice.ProjectId);
        var line = PurchaseOrderInvariant.RequireSingleLine(invoice.PurchaseOrder);
        var accepted = invoice.PurchaseOrder.GoodsReceipts
            .Where(item => LatestTechnicalAcceptance(item)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
            .Sum(item => item.AcceptedQuantity);
        if (accepted != line.Quantity)
        {
            throw new InvalidOperationException(
                "The full purchase-order quantity must be accepted by Stores before Finance can complete the match.");
        }
        var quantityMatches = invoice.Quantity == accepted;
        var priceMatches = invoice.UnitPrice == line.UnitPrice;
        var amountMatches = invoice.Amount == decimal.Round(invoice.Quantity * invoice.UnitPrice, 2, MidpointRounding.AwayFromZero);
        var allMatch = quantityMatches && priceMatches && amountMatches;
        var now = DateTime.UtcNow;
        invoice.ReceivedQuantitySnapshot = accepted;
        invoice.ReviewedByUserId = actorUserId;
        invoice.ReviewedAt = now;
        invoice.MatchNotes = notes;
        // The Finance match itself records the payment authority; no separate Supervisor authorization step exists.
        invoice.Status = !allMatch
            ? InvoiceStatuses.Mismatch
            : invoice.Amount > CeoExceptionThreshold
                ? InvoiceStatuses.AwaitingCeoApproval
                : InvoiceStatuses.Authorized;
        PaymentAuthorization? authorization = null;
        if (invoice.Status == InvoiceStatuses.Authorized)
        {
            authorization = new PaymentAuthorization
            {
                AuthorizationNumber = Reference("AUT", now), SupplierInvoiceId = invoice.Id, Amount = invoice.Amount,
                AuthorizedByUserId = actorUserId, Notes = notes, AuthorizedAt = now
            };
            _db.PaymentAuthorizations.Add(authorization);
        }
        await _events.AppendAsync(Chain(invoice.PurchaseOrder.RequisitionId), invoice.PurchaseOrder.RequisitionId,
            invoice.ProjectId, "SupplierInvoice", invoice.Id, invoice.InvoiceNumber,
            allMatch ? (invoice.Status == InvoiceStatuses.AwaitingCeoApproval ? "InvoiceMatchedCeoException" : "InvoiceMatched") : "InvoiceMismatch",
            actorUserId, actorRole, new { quantityMatches, priceMatches, amountMatches, accepted, notes }, now);
        await _db.SaveChangesAsync();
        if (authorization is not null)
        {
            await _events.AppendAsync(Chain(invoice.PurchaseOrder.RequisitionId), invoice.PurchaseOrder.RequisitionId,
                invoice.ProjectId, "PaymentAuthorization", authorization.Id, authorization.AuthorizationNumber, "PaymentAuthorized",
                actorUserId, actorRole, new { authorization.Amount, notes }, now);
            await _db.SaveChangesAsync();
        }
        await transaction.CommitAsync();
        return await LoadInvoiceAsync(id);
    }

    public async Task<SupplierInvoiceResponseDto> RecordCeoDecisionAsync(
        long id, CeoInvoiceDecisionRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "CEO");
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var invoice = await _db.SupplierInvoices.Include(item => item.PurchaseOrder)
            .SingleOrDefaultAsync(item => item.Id == id) ?? throw new KeyNotFoundException("The supplier invoice was not found.");
        if (invoice.Status != InvoiceStatuses.AwaitingCeoApproval) throw new InvalidOperationException("This invoice is not awaiting a CEO exception decision.");
        if (invoice.ReviewedByUserId == actorUserId || invoice.CapturedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The source or Finance reviewer cannot make the CEO exception decision.");
        var now = DateTime.UtcNow;
        invoice.CeoDecisionByUserId = actorUserId; invoice.CeoDecision = request.Approve ? "Approved" : "Rejected";
        invoice.CeoDecisionNotes = notes; invoice.CeoDecisionAt = now;
        // The CEO exception decision records the payment authority directly; Finance then executes it.
        invoice.Status = request.Approve ? InvoiceStatuses.Authorized : InvoiceStatuses.Rejected;
        await _events.AppendAsync(Chain(invoice.PurchaseOrder.RequisitionId), invoice.PurchaseOrder.RequisitionId, invoice.ProjectId,
            "SupplierInvoice", invoice.Id, invoice.InvoiceNumber, request.Approve ? "CeoExceptionApproved" : "CeoExceptionRejected",
            actorUserId, actorRole, new { notes }, now);
        PaymentAuthorization? authorization = null;
        if (request.Approve)
        {
            authorization = new PaymentAuthorization
            {
                AuthorizationNumber = Reference("AUT", now), SupplierInvoiceId = invoice.Id, Amount = invoice.Amount,
                AuthorizedByUserId = actorUserId, Notes = notes, AuthorizedAt = now
            };
            _db.PaymentAuthorizations.Add(authorization);
        }
        await _db.SaveChangesAsync();
        if (authorization is not null)
        {
            await _events.AppendAsync(Chain(invoice.PurchaseOrder.RequisitionId), invoice.PurchaseOrder.RequisitionId, invoice.ProjectId,
                "PaymentAuthorization", authorization.Id, authorization.AuthorizationNumber, "PaymentAuthorized",
                actorUserId, actorRole, new { authorization.Amount, notes }, now);
            await _db.SaveChangesAsync();
        }
        await transaction.CommitAsync();
        return await LoadInvoiceAsync(id);
    }

    public async Task<SupplierInvoiceResponseDto> AuthorizePaymentAsync(
        long id, AuthorizePaymentRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var invoice = await _db.SupplierInvoices.Include(item => item.PurchaseOrder)
            .SingleOrDefaultAsync(item => item.Id == id) ?? throw new KeyNotFoundException("The supplier invoice was not found.");
        if (invoice.Status != InvoiceStatuses.ReadyForAuthorization) throw new InvalidOperationException("The invoice has not passed all required matching and exception checks.");
        if (invoice.ReviewedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The Finance reviewer cannot authorize the resulting payment.");
        await RequireProjectAccessAsync(actorUserId, invoice.ProjectId);
        var now = DateTime.UtcNow;
        var authorization = new PaymentAuthorization
        {
            AuthorizationNumber = Reference("AUT", now), SupplierInvoiceId = invoice.Id, Amount = invoice.Amount,
            AuthorizedByUserId = actorUserId, Notes = notes, AuthorizedAt = now
        };
        _db.PaymentAuthorizations.Add(authorization);
        invoice.Status = InvoiceStatuses.Authorized;
        await _db.SaveChangesAsync();
        await _events.AppendAsync(Chain(invoice.PurchaseOrder.RequisitionId), invoice.PurchaseOrder.RequisitionId, invoice.ProjectId,
            "PaymentAuthorization", authorization.Id, authorization.AuthorizationNumber, "PaymentAuthorized",
            actorUserId, actorRole, new { authorization.Amount, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadInvoiceAsync(id);
    }

    public async Task<PaginatedResult<PaymentAuthorizationResponseDto>> GetAuthorizationsAsync(
        int page, int pageSize, int actorUserId, string actorRole, bool unpaidOnly = false)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor", "Finance Officer", "CEO", "Auditor");
        var query = _db.PaymentAuthorizations.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.SupplierInvoice.ProjectId && assignment.IsActive));
        if (unpaidOnly) query = query.Where(item => !_db.Payments.Any(payment => payment.PaymentAuthorizationId == item.Id));
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await AuthorizationQuery(query).OrderByDescending(item => item.AuthorizedAt)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<PaymentResponseDto> ExecutePaymentAsync(
        long authorizationId, ExecutePaymentRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Finance Officer");
        var method = InputNormalizer.RequiredText(request.Method, nameof(request.Method), maximumLength: 30);
        if (method is not ("BankTransfer" or "MPesa" or "Cheque" or "Cash"))
            throw new ArgumentException("Payment method must be BankTransfer, MPesa, Cheque, or Cash.");
        var externalReference = InputNormalizer.RequiredText(request.ExternalReference, nameof(request.ExternalReference), maximumLength: 100).ToUpperInvariant();
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var authorization = await _db.PaymentAuthorizations.Include(item => item.SupplierInvoice).ThenInclude(item => item.PurchaseOrder)
            .SingleOrDefaultAsync(item => item.Id == authorizationId) ?? throw new KeyNotFoundException("The payment authorization was not found.");
        if (authorization.SupplierInvoice.Status != InvoiceStatuses.Authorized) throw new InvalidOperationException("This authorization is not available for payment.");
        await RequireProjectAccessAsync(actorUserId, authorization.SupplierInvoice.ProjectId);
        var cashAccount = await ResolveCashAccountForPostingAsync(
            authorization.SupplierInvoice.ProjectId,
            request.CashAccountId,
            authorization.Amount);
        if (await _db.Payments.AnyAsync(item => item.PaymentAuthorizationId == authorization.Id)) throw new InvalidOperationException("This authorization has already been paid.");
        if (await _db.Payments.AnyAsync(item => item.ExternalReference == externalReference)
            || await _db.PettyCashDisbursements.AnyAsync(item => item.ExternalReference == externalReference))
            throw new InvalidOperationException("That external payment reference is already recorded.");
        var now = DateTime.UtcNow;
        var payment = new Payment
        {
            PaymentNumber = Reference("PAY", now), PaymentAuthorizationId = authorization.Id, Amount = authorization.Amount,
            Method = method, ExternalReference = externalReference, EvidenceReference = evidence,
            PaidByUserId = actorUserId, PaidAt = now
        };
        _db.Payments.Add(payment);
        authorization.SupplierInvoice.Status = InvoiceStatuses.Paid;
        await _db.SaveChangesAsync();
        if (cashAccount is not null)
        {
            cashAccount.Balance -= payment.Amount;
            cashAccount.UpdatedAt = now;
            _db.CashLedgerEntries.Add(new CashLedgerEntry
            {
                EntryNumber = Reference("CASH", now),
                CashAccountId = cashAccount.Id,
                ProjectId = authorization.SupplierInvoice.ProjectId,
                AmountDelta = -payment.Amount,
                BalanceAfter = cashAccount.Balance,
                EntryType = "SupplierPayment",
                ReferenceType = "Payment",
                ReferenceId = payment.Id,
                ReferenceNumber = payment.PaymentNumber,
                PostedByUserId = actorUserId,
                PostedAt = now,
                Notes = $"Supplier invoice {authorization.SupplierInvoice.InvoiceNumber}"
            });
        }
        var receipt = new PaymentReceipt
        {
            ReceiptNumber = Reference("RCT", now), PaymentId = payment.Id, Amount = payment.Amount,
            IssuedByUserId = actorUserId, IssuedAt = now
        };
        _db.PaymentReceipts.Add(receipt);
        await _events.AppendAsync(Chain(authorization.SupplierInvoice.PurchaseOrder.RequisitionId),
            authorization.SupplierInvoice.PurchaseOrder.RequisitionId, authorization.SupplierInvoice.ProjectId,
            "Payment", payment.Id, payment.PaymentNumber, "PaymentExecuted", actorUserId, actorRole,
            new
            {
                payment.Amount,
                method,
                externalReference,
                receipt.ReceiptNumber,
                evidence,
                cashAccountId = cashAccount?.Id,
                cashAccountName = cashAccount?.Name
            }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadPaymentAsync(payment.Id);
    }

    public async Task<PaginatedResult<PaymentResponseDto>> GetPaymentsAsync(int page, int pageSize, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor", "Finance Officer", "CEO", "Auditor");
        var query = _db.Payments.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.PaymentAuthorization.SupplierInvoice.ProjectId && assignment.IsActive));
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await PaymentQuery(query).OrderByDescending(item => item.PaidAt)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<CashBookResponseDto> GetCashBookAsync(int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "CEO", "Auditor");

        var projects = await _db.Projects.AsNoTracking()
            .OrderBy(item => item.Id)
            .Select(item => new { item.Id, item.Name, item.Budget })
            .ToListAsync();
        var projectIds = projects.Select(item => item.Id).ToList();

        var budgetRevisions = await _db.ProjectBudgets.AsNoTracking()
            .Where(item => projectIds.Contains(item.ProjectId))
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Select(item => new { item.ProjectId, item.ApprovedAmount })
            .ToListAsync();
        var budgets = budgetRevisions
            .GroupBy(item => item.ProjectId)
            .ToDictionary(group => group.Key, group => group.First().ApprovedAmount);

        var supplierRows = await _db.Payments.AsNoTracking()
            .Where(item => projectIds.Contains(item.PaymentAuthorization.SupplierInvoice.ProjectId))
            .Select(item => new
            {
                ProjectId = item.PaymentAuthorization.SupplierInvoice.ProjectId,
                item.Amount,
                SupplierName = item.PaymentAuthorization.SupplierInvoice.Supplier.Name,
                InvoiceNumber = item.PaymentAuthorization.SupplierInvoice.InvoiceNumber,
                MaterialName = item.PaymentAuthorization.SupplierInvoice.PurchaseOrder.Lines
                    .Select(line => line.Material.Name)
                    .FirstOrDefault(),
                item.PaidAt
            })
            .ToListAsync();

        var pettyCashRows = await _db.PettyCashReconciliations.AsNoTracking()
            .Where(item => item.Status == PettyCashReconciliationStatuses.Approved
                && projectIds.Contains(item.PettyCashRequest.ProjectId))
            .Select(item => new
            {
                ProjectId = item.PettyCashRequest.ProjectId,
                Amount = item.AmountExpensed ?? item.AmountSpent,
                item.PettyCashRequest.Purpose,
                CostCodeName = item.PettyCashRequest.CostCode.Name,
                OccurredAt = item.ReviewedAt ?? item.SubmittedAt
            })
            .ToListAsync();

        var siteCashRows = await _db.PettyCashDisbursements.AsNoTracking()
            .Where(item => !item.PettyCashRequest.Reconciliations.Any(reconciliation =>
                    reconciliation.Status == PettyCashReconciliationStatuses.Approved)
                && projectIds.Contains(item.PettyCashRequest.ProjectId))
            .Select(item => new
            {
                ProjectId = item.PettyCashRequest.ProjectId,
                item.Amount,
                item.PettyCashRequest.Purpose,
                item.RecipientName,
                item.DisbursedAt
            })
            .ToListAsync();

        var purchaseCommitmentRows = await _db.PurchaseOrderLines.AsNoTracking()
            .Where(item => (item.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Approved
                    || item.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Issued)
                && projectIds.Contains(item.PurchaseOrder.ProjectId)
                && !_db.Payments.Any(payment =>
                    payment.PaymentAuthorization.SupplierInvoice.PurchaseOrderId == item.PurchaseOrderId))
            .GroupBy(item => item.PurchaseOrder.ProjectId)
            .Select(group => new
            {
                ProjectId = group.Key,
                Amount = group.Sum(item => item.Quantity * item.UnitPrice)
            })
            .ToListAsync();

        var pettyCashCommitmentRows = await _db.PettyCashRequests.AsNoTracking()
            .Where(item => item.Status == PettyCashStatuses.Approved
                && item.AmountCommitted.HasValue
                && projectIds.Contains(item.ProjectId))
            .GroupBy(item => item.ProjectId)
            .Select(group => new
            {
                ProjectId = group.Key,
                Amount = group.Sum(item => item.AmountCommitted ?? 0m)
            })
            .ToListAsync();

        var result = projects.Select(project =>
        {
            var supplierPayments = supplierRows
                .Where(item => item.ProjectId == project.Id)
                .Sum(item => item.Amount);
            var pettyCashSpent = pettyCashRows
                .Where(item => item.ProjectId == project.Id)
                .Sum(item => item.Amount);
            var cashAwaitingAccountability = siteCashRows
                .Where(item => item.ProjectId == project.Id)
                .Sum(item => item.Amount);
            var openCommitments = purchaseCommitmentRows
                .Where(item => item.ProjectId == project.Id)
                .Sum(item => item.Amount)
                + pettyCashCommitmentRows
                    .Where(item => item.ProjectId == project.Id)
                    .Sum(item => item.Amount);
            var allocatedBudget = budgets.GetValueOrDefault(project.Id, project.Budget);
            var totalUsed = supplierPayments + pettyCashSpent;

            var entries = supplierRows
                .Where(item => item.ProjectId == project.Id)
                .Select(item => new CashBookEntryResponseDto
                {
                    EntryType = "Supplier payment",
                    Title = item.SupplierName,
                    Detail = string.IsNullOrWhiteSpace(item.MaterialName)
                        ? $"Invoice {item.InvoiceNumber}"
                        : $"{item.MaterialName} · Invoice {item.InvoiceNumber}",
                    Amount = item.Amount,
                    State = "Used",
                    OccurredAt = item.PaidAt
                })
                .Concat(pettyCashRows
                    .Where(item => item.ProjectId == project.Id)
                    .Select(item => new CashBookEntryResponseDto
                    {
                        EntryType = "Petty cash",
                        Title = item.Purpose,
                        Detail = item.CostCodeName,
                        Amount = item.Amount,
                        State = "Used",
                        OccurredAt = item.OccurredAt
                    }))
                .Concat(siteCashRows
                    .Where(item => item.ProjectId == project.Id)
                    .Select(item => new CashBookEntryResponseDto
                    {
                        EntryType = "Petty cash",
                        Title = item.Purpose,
                        Detail = $"With {item.RecipientName}",
                        Amount = item.Amount,
                        State = "Awaiting accountability",
                        OccurredAt = item.DisbursedAt
                    }))
                .OrderByDescending(item => item.OccurredAt)
                .Take(8)
                .ToList();

            return new CashBookProjectResponseDto
            {
                ProjectId = project.Id,
                ProjectName = project.Name,
                AllocatedBudget = allocatedBudget,
                SupplierPayments = supplierPayments,
                PettyCashSpent = pettyCashSpent,
                OpenCommitments = openCommitments,
                CashAwaitingAccountability = cashAwaitingAccountability,
                TotalUsed = totalUsed,
                BudgetAvailable = allocatedBudget - totalUsed - openCommitments - cashAwaitingAccountability,
                EntryCount = supplierRows.Count(item => item.ProjectId == project.Id)
                    + pettyCashRows.Count(item => item.ProjectId == project.Id)
                    + siteCashRows.Count(item => item.ProjectId == project.Id),
                RecentEntries = entries
            };
        }).ToList();

        return new CashBookResponseDto
        {
            GeneratedAt = DateTime.UtcNow,
            Projects = result
        };
    }

    public async Task<PaginatedResult<ControlEventResponseDto>> GetControlEventsAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null,
        int? requisitionId = null, string? chainKey = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "CEO", "Auditor");
        if (projectId is <= 0) throw new ArgumentException("Project ID must be positive.", nameof(projectId));
        if (requisitionId is <= 0) throw new ArgumentException("Requisition ID must be positive.", nameof(requisitionId));
        var pagination = Pagination.Normalize(page, pageSize);
        var windowSize = (int)Math.Min(
            int.MaxValue,
            (long)pagination.Offset + pagination.PageSize);

        var normalizedChainKey = NormalizeChainKey(chainKey);
        var effectiveRequisitionId = requisitionId;
        var isStandaloneChain = false;
        if (normalizedChainKey is not null)
        {
            if (normalizedChainKey.StartsWith("REQ-", StringComparison.Ordinal))
            {
                if (!int.TryParse(normalizedChainKey.AsSpan(4), out var chainRequisitionId))
                    throw new ArgumentException("The requisition chain ID is outside the supported range.", nameof(chainKey));
                if (requisitionId.HasValue && requisitionId.Value != chainRequisitionId)
                    throw new ArgumentException("The requisition ID does not match the requested chain key.", nameof(requisitionId));
                effectiveRequisitionId = chainRequisitionId;
            }
            else
            {
                if (requisitionId.HasValue)
                    throw new ArgumentException("A requisition ID cannot be combined with a standalone chain key.", nameof(requisitionId));
                isStandaloneChain = true;
            }
        }

        var controlQuery = _db.ControlEvents.AsNoTracking();
        if (projectId.HasValue) controlQuery = controlQuery.Where(item => item.ProjectId == projectId.Value);
        if (effectiveRequisitionId.HasValue) controlQuery = controlQuery.Where(item => item.RequisitionId == effectiveRequisitionId.Value);
        if (normalizedChainKey is not null) controlQuery = controlQuery.Where(item => item.ChainKey == normalizedChainKey);
        var controlCount = await controlQuery.CountAsync();
        var controls = await controlQuery
            .Select(item => new ControlEventResponseDto
            {
                ChainKey = item.ChainKey, SequenceNumber = item.SequenceNumber, RequisitionId = item.RequisitionId,
                ProjectId = item.ProjectId, ProjectName = item.Project.Name, EntityType = item.EntityType, EntityId = item.EntityId,
                ReferenceNumber = item.ReferenceNumber, EventType = item.EventType, ActorName = item.ActorUser.FullName,
                ActorRole = item.ActorRole,
                MaterialName = item.Requisition == null ? null : item.Requisition.Material.Name,
                MaterialUnit = item.Requisition == null ? null : item.Requisition.Material.Unit,
                RequestedQuantity = item.Requisition == null ? null : item.Requisition.Quantity,
                DetailsJson = item.DetailsJson, OccurredAt = item.OccurredAt, EventHash = item.EventHash
            })
            .OrderByDescending(item => item.OccurredAt)
            .ThenByDescending(item => item.SequenceNumber)
            .Take(windowSize)
            .ToListAsync();

        var requisitions = new List<ControlEventResponseDto>();
        var sourcing = new List<ControlEventResponseDto>();
        var orders = new List<ControlEventResponseDto>();
        var requisitionCount = 0;
        var sourcingCount = 0;
        var orderCount = 0;
        if (!isStandaloneChain)
        {
            var reqQuery = _db.RequisitionApprovalEvents.AsNoTracking().AsQueryable();
            if (projectId.HasValue) reqQuery = reqQuery.Where(item => item.Requisition.ProjectId == projectId.Value);
            if (effectiveRequisitionId.HasValue) reqQuery = reqQuery.Where(item => item.RequisitionId == effectiveRequisitionId.Value);
            requisitionCount = await reqQuery.CountAsync();
            requisitions = await reqQuery.Select(item => new ControlEventResponseDto
            {
                ChainKey = "REQ-" + item.RequisitionId, SequenceNumber = item.SequenceNumber, RequisitionId = item.RequisitionId,
                ProjectId = item.Requisition.ProjectId, ProjectName = item.Requisition.Project.Name, EntityType = "Requisition", EntityId = item.RequisitionId,
                ReferenceNumber = "MR-" + item.RequisitionId, EventType = item.EventType, ActorName = item.ActorUser.FullName,
                ActorRole = item.ActorRole, MaterialName = item.Requisition.Material.Name,
                MaterialUnit = item.Requisition.Material.Unit, RequestedQuantity = item.Requisition.Quantity,
                DetailsJson = item.EventDataJson, OccurredAt = item.OccurredAt, EventHash = item.EventHash
            })
                .OrderByDescending(item => item.OccurredAt)
                .ThenByDescending(item => item.SequenceNumber)
                .Take(windowSize)
                .ToListAsync();

            var sourcingQuery = _db.SourcingRoundEvents.AsNoTracking().AsQueryable();
            if (projectId.HasValue) sourcingQuery = sourcingQuery.Where(item => item.SourcingRound.Requisition.ProjectId == projectId.Value);
            if (effectiveRequisitionId.HasValue) sourcingQuery = sourcingQuery.Where(item => item.SourcingRound.RequisitionId == effectiveRequisitionId.Value);
            sourcingCount = await sourcingQuery.CountAsync();
            sourcing = await sourcingQuery.Select(item => new ControlEventResponseDto
            {
                ChainKey = "REQ-" + item.SourcingRound.RequisitionId, SequenceNumber = 1000 + (int)item.Id,
                RequisitionId = item.SourcingRound.RequisitionId, ProjectId = item.SourcingRound.Requisition.ProjectId,
                ProjectName = item.SourcingRound.Requisition.Project.Name, EntityType = "SourcingRound", EntityId = item.SourcingRoundId,
                ReferenceNumber = "SRC-" + item.SourcingRoundId, EventType = item.EventType, ActorName = item.ActorUser.FullName,
                ActorRole = item.ActorRole, MaterialName = item.SourcingRound.Requisition.Material.Name,
                MaterialUnit = item.SourcingRound.Requisition.Material.Unit, RequestedQuantity = item.SourcingRound.Requisition.Quantity,
                DetailsJson = item.Notes, OccurredAt = item.OccurredAt, EventHash = string.Empty
            })
                .OrderByDescending(item => item.OccurredAt)
                .ThenByDescending(item => item.SequenceNumber)
                .Take(windowSize)
                .ToListAsync();

            var poQuery = _db.PurchaseOrderEvents.AsNoTracking().AsQueryable();
            if (projectId.HasValue) poQuery = poQuery.Where(item => item.PurchaseOrder.ProjectId == projectId.Value);
            if (effectiveRequisitionId.HasValue) poQuery = poQuery.Where(item => item.PurchaseOrder.RequisitionId == effectiveRequisitionId.Value);
            orderCount = await poQuery.CountAsync();
            orders = await poQuery.Select(item => new ControlEventResponseDto
            {
                ChainKey = "REQ-" + item.PurchaseOrder.RequisitionId, SequenceNumber = 2000 + (int)item.Id,
                RequisitionId = item.PurchaseOrder.RequisitionId, ProjectId = item.PurchaseOrder.ProjectId,
                ProjectName = item.PurchaseOrder.Project.Name, EntityType = "PurchaseOrder", EntityId = item.PurchaseOrderId,
                ReferenceNumber = item.PurchaseOrder.PurchaseOrderNumber, EventType = item.EventType, ActorName = item.ActorUser.FullName,
                ActorRole = item.ActorRole, MaterialName = item.PurchaseOrder.Requisition.Material.Name,
                MaterialUnit = item.PurchaseOrder.Requisition.Material.Unit, RequestedQuantity = item.PurchaseOrder.Requisition.Quantity,
                DetailsJson = item.DetailsJson, OccurredAt = item.OccurredAt, EventHash = string.Empty
            })
                .OrderByDescending(item => item.OccurredAt)
                .ThenByDescending(item => item.SequenceNumber)
                .Take(windowSize)
                .ToListAsync();
        }

        var items = requisitions.Concat(sourcing).Concat(orders).Concat(controls)
            .OrderByDescending(item => item.OccurredAt)
            .ThenByDescending(item => item.SequenceNumber)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToList();
        foreach (var item in items.Where(item =>
            item.EntityType is not ("Requisition" or "SourcingRound" or "PurchaseOrder")))
        {
            item.EventQuantity = ReadEventQuantity(item.EntityType, item.EventType, item.DetailsJson);
        }

        return Page(
            items,
            checked(controlCount + requisitionCount + sourcingCount + orderCount),
            pagination.Page,
            pagination.PageSize);
    }

    private static IQueryable<SupplierInvoice> InvoiceQuery(IQueryable<SupplierInvoice> query) => query
        .Include(item => item.PurchaseOrder).ThenInclude(order => order.Lines).ThenInclude(line => line.Material)
        .Include(item => item.PurchaseOrder).ThenInclude(order => order.Requisition)
        .Include(item => item.PurchaseOrder).ThenInclude(order => order.GoodsReceipts)
            .ThenInclude(receipt => receipt.TechnicalAcceptances).ThenInclude(item => item.EngineerUser)
        .Include(item => item.Project).Include(item => item.Supplier).Include(item => item.CapturedByUser)
        .Include(item => item.ReviewedByUser).Include(item => item.CeoDecisionByUser)
        .Include(item => item.PurchaseOrder)
        .AsSplitQuery();

    private async Task<SupplierInvoiceResponseDto> LoadInvoiceAsync(long id)
    {
        var invoice = await InvoiceQuery(_db.SupplierInvoices.AsNoTracking()).SingleAsync(item => item.Id == id);
        var authorization = await AuthorizationQuery(_db.PaymentAuthorizations.AsNoTracking().Where(item => item.SupplierInvoiceId == id)).SingleOrDefaultAsync();
        var payment = authorization is null ? null : await PaymentQuery(_db.Payments.AsNoTracking().Where(item => item.PaymentAuthorizationId == authorization.Id)).SingleOrDefaultAsync();
        return ToDto(invoice, authorization, payment);
    }

    private static SupplierInvoiceResponseDto ToDto(SupplierInvoice invoice) => ToDto(invoice, null, null);

    private static SupplierInvoiceResponseDto ToDto(SupplierInvoice invoice, PaymentAuthorization? authorization, Payment? payment)
    {
        var line = PurchaseOrderInvariant.RequireSingleLine(invoice.PurchaseOrder);
        var relevantReceipts = invoice.PurchaseOrder.GoodsReceipts
            .Where(item => item.AcceptedQuantity > 0
                && LatestTechnicalAcceptance(item)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
            .ToList();
        var accepted = invoice.ReceivedQuantitySnapshot
            ?? relevantReceipts.Sum(item => item.AcceptedQuantity);
        const string technicalAcceptanceStatus = "NotRequired";
        return new SupplierInvoiceResponseDto
        {
            Id = invoice.Id, InvoiceNumber = invoice.InvoiceNumber, PurchaseOrderId = invoice.PurchaseOrderId,
            PurchaseOrderNumber = invoice.PurchaseOrder.PurchaseOrderNumber, RequisitionId = invoice.PurchaseOrder.RequisitionId,
            ProjectId = invoice.ProjectId, ProjectName = invoice.Project.Name, SupplierId = invoice.SupplierId,
            SupplierName = invoice.Supplier.Name, MaterialName = line.Material.Name, MaterialUnit = line.Material.Unit,
            OrderedQuantity = line.Quantity, OrderedUnitPrice = line.UnitPrice, AcceptedQuantity = accepted,
            Quantity = invoice.Quantity, UnitPrice = invoice.UnitPrice, Amount = invoice.Amount,
            DocumentReference = invoice.DocumentReference, Status = invoice.Status,
            QuantityMatches = invoice.ReviewedAt.HasValue && invoice.Quantity == accepted,
            PriceMatches = invoice.ReviewedAt.HasValue && invoice.UnitPrice == line.UnitPrice,
            AmountMatches = invoice.ReviewedAt.HasValue && invoice.Amount == decimal.Round(invoice.Quantity * invoice.UnitPrice, 2, MidpointRounding.AwayFromZero),
            RequiresTechnicalAcceptance = false,
            TechnicalAcceptanceStatus = technicalAcceptanceStatus,
            TechnicalAcceptanceRequiredCount = 0,
            TechnicalAcceptanceAcceptedCount = 0,
            TechnicalAcceptanceRejectedCount = 0,
            LatestTechnicalReviewerName = null,
            LatestTechnicalReviewAt = null,
            RequiresCeoApproval = invoice.Amount > CeoExceptionThreshold, MatchNotes = invoice.MatchNotes,
            CapturedByName = invoice.CapturedByUser.FullName, CapturedAt = invoice.CapturedAt,
            ReviewedByUserId = invoice.ReviewedByUserId,
            ReviewedByName = invoice.ReviewedByUser?.FullName, ReviewedAt = invoice.ReviewedAt,
            CeoDecision = invoice.CeoDecision, CeoDecisionNotes = invoice.CeoDecisionNotes, CeoDecisionAt = invoice.CeoDecisionAt,
            Authorization = authorization is null ? null : ToDto(authorization),
            Payment = payment is null ? null : ToDto(payment)
        };
    }

    private static IQueryable<PaymentAuthorization> AuthorizationQuery(IQueryable<PaymentAuthorization> query) => query
        .Include(item => item.AuthorizedByUser).Include(item => item.SupplierInvoice).ThenInclude(item => item.Supplier)
        .Include(item => item.SupplierInvoice).ThenInclude(item => item.Project);
    private static PaymentAuthorizationResponseDto ToDto(PaymentAuthorization item) => new()
    {
        Id = item.Id, AuthorizationNumber = item.AuthorizationNumber, SupplierInvoiceId = item.SupplierInvoiceId,
        ProjectId = item.SupplierInvoice.ProjectId,
        Amount = item.Amount, SupplierName = item.SupplierInvoice.Supplier.Name, ProjectName = item.SupplierInvoice.Project.Name,
        AuthorizedByUserId = item.AuthorizedByUserId, AuthorizedByName = item.AuthorizedByUser.FullName,
        Notes = item.Notes, AuthorizedAt = item.AuthorizedAt,
        IsPaid = item.SupplierInvoice.Status == InvoiceStatuses.Paid
    };

    private static IQueryable<Payment> PaymentQuery(IQueryable<Payment> query) => query
        .Include(item => item.PaidByUser).Include(item => item.PaymentAuthorization)
        .Include(item => item.PaymentAuthorization).ThenInclude(item => item.SupplierInvoice)
        .Include(item => item.Receipt)
        .AsSplitQuery();
    private async Task<PaymentResponseDto> LoadPaymentAsync(long id) => ToDto(await PaymentQuery(_db.Payments.AsNoTracking()).SingleAsync(item => item.Id == id));
    private static PaymentResponseDto ToDto(Payment item)
    {
        return new PaymentResponseDto
        {
            Id = item.Id, PaymentNumber = item.PaymentNumber,
            DisplayNumber = $"PAY-{item.PaidAt.Year}-{item.Id:0000}",
            PaymentAuthorizationId = item.PaymentAuthorizationId,
            Amount = item.Amount, Method = item.Method, ExternalReference = item.ExternalReference,
            EvidenceReference = item.EvidenceReference, PaidByName = item.PaidByUser.FullName, PaidAt = item.PaidAt,
            ReceiptNumber = item.Receipt?.ReceiptNumber ?? string.Empty
        };
    }

    private static GoodsReceiptTechnicalAcceptance? LatestTechnicalAcceptance(GoodsReceipt receipt) =>
        receipt.TechnicalAcceptances
            .OrderByDescending(item => item.ReviewSequence)
            .FirstOrDefault();

    private static decimal QuantityEligibleForInvoice(
        PurchaseOrderLine line,
        IEnumerable<GoodsReceipt> receipts) =>
        receipts
            .Where(item => LatestTechnicalAcceptance(item)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
            .Sum(item => item.AcceptedQuantity);

    private static decimal? ReadEventQuantity(string entityType, string eventType, string? detailsJson)
    {
        var propertyName = (entityType, eventType) switch
        {
            ("GoodsReceipt", "GoodsReceived") => "accepted",
            ("GoodsReceiptTechnicalAcceptance", _) => "quantity",
            ("MaterialIssue", "MaterialIssued") => "quantity",
            ("MaterialIssue", "MaterialReceiptConfirmed" or "MaterialReceiptDisputed") => "received",
            ("MaterialUsage", _) => "quantity",
            ("SupplierInvoice", "InvoiceCaptured") => "quantity",
            _ => null
        };
        if (propertyName is null || string.IsNullOrWhiteSpace(detailsJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(detailsJson);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase)
                    && property.Value.ValueKind == JsonValueKind.Number
                    && property.Value.TryGetDecimal(out var quantity))
                    return quantity;
            }
        }
        catch (JsonException)
        {
            // Older imported events may contain plain-text notes rather than JSON.
        }

        return null;
    }

    private async Task RequireRoleAsync(int userId, string claimedRole, string requiredRole) => await RequireAnyRoleAsync(userId, claimedRole, requiredRole);
    private async Task RequireAnyRoleAsync(int userId, string claimedRole, params string[] allowed)
    {
        var actor = await _roles.ResolveAsync(userId);
        if (actor is null || actor.EffectiveRole != claimedRole || !allowed.Contains(actor.EffectiveRole))
            throw new UnauthorizedAccessException($"This action requires one of these roles: {string.Join(", ", allowed)}.");
    }
    private async Task RequireProjectAccessAsync(int userId, int projectId)
    {
        if (!await CanVerifyAllProjectsAsync(userId)
            && !await _db.UserProjectAssignments.AsNoTracking().AnyAsync(item => item.UserId == userId && item.ProjectId == projectId && item.IsActive))
            throw new UnauthorizedAccessException("You are not assigned to this project.");
    }
    private async Task<bool> CanVerifyAllProjectsAsync(int userId) =>
        (await _roles.ResolveAsync(userId))?.CanSwitchRoles == true;
    private async Task<CashAccount?> ResolveCashAccountForPostingAsync(
        int projectId,
        long? cashAccountId,
        decimal amount)
    {
        if (!cashAccountId.HasValue)
        {
            if (await _db.CashAccounts.AsNoTracking().AnyAsync(item => item.ProjectId == projectId))
                throw new ArgumentException("Select the project cash account used for this payment.", nameof(cashAccountId));
            return null;
        }
        if (cashAccountId <= 0)
            throw new ArgumentException("Cash-account ID must be positive.", nameof(cashAccountId));

        var account = await _db.CashAccounts
            .FromSqlInterpolated($"SELECT * FROM \"CashAccounts\" WHERE \"Id\" = {cashAccountId.Value} AND \"ProjectId\" = {projectId} FOR UPDATE")
            .SingleOrDefaultAsync()
            ?? throw new KeyNotFoundException("The selected project cash account was not found.");
        if (account.Balance < amount)
            throw new InvalidOperationException($"The selected cash account has insufficient funds. Available balance: KES {account.Balance:N2}.");
        return account;
    }
    private static string Reference(string prefix, DateTime now) => $"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..30];
    private static string Chain(int requisitionId) => $"REQ-{requisitionId}";
    private static string? NormalizeChainKey(string? chainKey)
    {
        if (chainKey is null) return null;
        var normalized = chainKey.Trim();
        if (normalized.Length is < 3 or > 80)
            throw new ArgumentException("Chain key must be between 3 and 80 characters.", nameof(chainKey));

        var separator = normalized.LastIndexOf('-');
        var prefix = separator > 0 ? normalized[..separator] : string.Empty;
        var idText = separator > 0 ? normalized[(separator + 1)..] : string.Empty;
        if (prefix.Length == 0
            || prefix.Any(character => character is not (>= 'A' and <= 'Z') and not (>= '0' and <= '9'))
            || prefix[0] is not (>= 'A' and <= 'Z')
            || idText.Length == 0
            || idText[0] == '0'
            || idText.Any(character => character is not (>= '0' and <= '9'))
            || !long.TryParse(idText, out var id)
            || id <= 0)
            throw new ArgumentException("Chain key must use the format PREFIX-ID, for example REQ-42 or TRF-7.", nameof(chainKey));

        return normalized;
    }
    private static PaginatedResult<T> Page<T>(IReadOnlyList<T> items, int total, int page, int pageSize) => new()
    { Items = items, TotalCount = total, Page = page, PageSize = pageSize };
}
