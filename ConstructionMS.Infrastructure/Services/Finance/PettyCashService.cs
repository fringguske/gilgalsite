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

public sealed class PettyCashService(AppDbContext db, IActorRoleResolver roles) : IPettyCashService
{
    public const decimal RequestLimit = 100_000m;
    private readonly ControlEventWriter _events = new(db);

    public async Task<PaginatedResult<PettyCashRequestResponseDto>> GetRequestsAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, string? status = null)
    {
        var actor = await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor", "Finance Officer", "CEO", "Auditor");
        var query = db.PettyCashRequests.AsNoTracking();
        if (actor.EffectiveRole is not ("CEO" or "Auditor") && !actor.CanSwitchRoles)
        {
            query = query.Where(item => db.UserProjectAssignments.Any(assignment =>
                assignment.UserId == actor.UserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        }
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(item => item.Status == status.Trim());
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await RequestQuery(query).OrderByDescending(item => item.RequestedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<PettyCashRequestResponseDto> CreateRequestAsync(
        CreatePettyCashRequestDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor");
        var amount = InputNormalizer.Positive(request.Amount, nameof(request.Amount), 18, 2);
        if (amount > RequestLimit) throw new ArgumentException($"Petty cash is limited to KES {RequestLimit:N0}; use procurement for larger spending.");
        var purpose = InputNormalizer.RequiredText(request.Purpose, nameof(request.Purpose), 3, 500);
        if (request.NeededByDate < DateOnly.FromDateTime(DateTime.UtcNow)) throw new ArgumentException("Needed-by date cannot be in the past.");
        await RequireProjectAccessAsync(actorUserId, request.ProjectId);
        if (await HasUnreconciledRequestAsync(actorUserId))
            throw new InvalidOperationException("Reconcile or close your existing petty-cash request before requesting another float.");
        var validCostCode = await db.CostCodes.AsNoTracking().AnyAsync(item => item.Id == request.CostCodeId && item.ProjectId == request.ProjectId && item.IsActive);
        if (!validCostCode) throw new ArgumentException("Select an active budget area for this project.");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var now = DateTime.UtcNow;
        var item = new PettyCashRequest
        {
            RequestNumber = Reference("PCR", now), ProjectId = request.ProjectId, CostCodeId = request.CostCodeId,
            Purpose = purpose, AmountRequested = amount, NeededByDate = request.NeededByDate,
            RequestedByUserId = actorUserId, RequestedAt = now
        };
        db.PettyCashRequests.Add(item);
        await db.SaveChangesAsync();
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashRequest", item.Id, item.RequestNumber,
            "PettyCashRequested", actorUserId, actorRole, new { amount, item.CostCodeId, purpose, item.NeededByDate }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    public async Task<PettyCashRequestResponseDto> DecideRequestAsync(
        long id, DecidePettyCashRequestDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Finance Officer");
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"Projects\" project JOIN \"PettyCashRequests\" request ON request.\"ProjectId\" = project.\"Id\" WHERE request.\"Id\" = {id} FOR UPDATE OF project");
        var item = await db.PettyCashRequests.SingleOrDefaultAsync(candidate => candidate.Id == id)
            ?? throw new KeyNotFoundException("The petty-cash request was not found.");
        if (item.Status != PettyCashStatuses.PendingFinanceApproval) throw new InvalidOperationException("This petty-cash request has already been decided.");
        if (item.RequestedByUserId == actorUserId) throw new UnauthorizedAccessException("The requester cannot approve petty cash.");
        await RequireProjectAccessAsync(actorUserId, item.ProjectId);
        decimal? approvedAmount = null;
        if (request.Approve)
        {
            approvedAmount = InputNormalizer.Positive(request.AmountApproved ?? item.AmountRequested, nameof(request.AmountApproved), 18, 2);
            if (approvedAmount > item.AmountRequested) throw new ArgumentException("Approved amount cannot exceed the requested amount.");
            await BudgetCommitmentGuard.EnsureAvailableAsync(
                db,
                item.ProjectId,
                item.CostCodeId,
                approvedAmount.Value,
                excludedPettyCashRequestId: item.Id);
        }
        var now = DateTime.UtcNow;
        item.AmountApproved = approvedAmount;
        item.AmountCommitted = approvedAmount;
        item.FinanceApprovedByUserId = actorUserId;
        item.FinanceDecisionAt = now;
        item.FinanceDecisionNotes = notes;
        item.Status = request.Approve ? PettyCashStatuses.Approved : PettyCashStatuses.Rejected;
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashRequest", item.Id, item.RequestNumber,
            request.Approve ? "PettyCashApproved" : "PettyCashRejected", actorUserId, actorRole,
            new { amountRequested = item.AmountRequested, approvedAmount, notes }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    public async Task<PettyCashRequestResponseDto> DisburseAsync(
        long id, DisbursePettyCashRequestDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Finance Officer");
        var method = InputNormalizer.RequiredText(request.Method, nameof(request.Method), maximumLength: 30);
        if (method is not ("MPesa" or "BankTransfer" or "Cheque" or "Cash")) throw new ArgumentException("Method must be MPesa, BankTransfer, Cheque, or Cash.");
        var reference = InputNormalizer.RequiredText(request.ExternalReference, nameof(request.ExternalReference), 3, 100).ToUpperInvariant();
        var recipient = InputNormalizer.RequiredText(request.RecipientName, nameof(request.RecipientName), 3, 150);
        var acknowledgement = InputNormalizer.RequiredText(request.RecipientAcknowledgementReference, nameof(request.RecipientAcknowledgementReference), 3, 500);
        var evidence = InputNormalizer.RequiredText(request.EvidenceReference, nameof(request.EvidenceReference), 3, 500);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var item = await db.PettyCashRequests.SingleOrDefaultAsync(candidate => candidate.Id == id)
            ?? throw new KeyNotFoundException("The petty-cash request was not found.");
        if (item.Status != PettyCashStatuses.Approved || !item.AmountApproved.HasValue) throw new InvalidOperationException("Finance has not approved this petty-cash request for disbursement.");
        if (item.RequestedByUserId == actorUserId) throw new UnauthorizedAccessException("The requester cannot execute this disbursement.");
        await RequireProjectAccessAsync(actorUserId, item.ProjectId);
        var cashAccount = await ResolveCashAccountForPostingAsync(
            item.ProjectId,
            request.CashAccountId,
            item.AmountApproved.Value);
        if (await db.PettyCashDisbursements.AnyAsync(candidate => candidate.PettyCashRequestId == item.Id)) throw new InvalidOperationException("This petty-cash request has already been disbursed.");
        if (await db.PettyCashDisbursements.AnyAsync(candidate => candidate.ExternalReference == reference)
            || await db.Payments.AnyAsync(candidate => candidate.ExternalReference == reference)) throw new InvalidOperationException("That payment reference is already recorded.");
        var now = DateTime.UtcNow;
        var disbursement = new PettyCashDisbursement
        {
            DisbursementNumber = Reference("PCD", now), PettyCashRequestId = item.Id, Amount = item.AmountApproved.Value,
            Method = method, ExternalReference = reference, RecipientName = recipient,
            RecipientAcknowledgementReference = acknowledgement, EvidenceReference = evidence,
            DisbursedByUserId = actorUserId, DisbursedAt = now
        };
        db.PettyCashDisbursements.Add(disbursement);
        item.Status = PettyCashStatuses.Disbursed;
        await db.SaveChangesAsync();
        if (cashAccount is not null)
        {
            cashAccount.Balance -= disbursement.Amount;
            cashAccount.UpdatedAt = now;
            db.CashLedgerEntries.Add(new CashLedgerEntry
            {
                EntryNumber = Reference("CASH", now),
                CashAccountId = cashAccount.Id,
                ProjectId = item.ProjectId,
                AmountDelta = -disbursement.Amount,
                BalanceAfter = cashAccount.Balance,
                EntryType = "PettyCashDisbursement",
                ReferenceType = "PettyCashDisbursement",
                ReferenceId = disbursement.Id,
                ReferenceNumber = disbursement.DisbursementNumber,
                PostedByUserId = actorUserId,
                PostedAt = now,
                Notes = item.Purpose
            });
        }
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashDisbursement", disbursement.Id,
            disbursement.DisbursementNumber, "PettyCashDisbursed", actorUserId, actorRole,
            new
            {
                disbursement.Amount,
                method,
                reference,
                recipient,
                acknowledgement,
                evidence,
                cashAccountId = cashAccount?.Id,
                cashAccountName = cashAccount?.Name
            }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    public async Task<PettyCashRequestResponseDto> ConfirmReceiptAsync(
        long id, ConfirmPettyCashReceiptDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor");
        var amountReceived = InputNormalizer.Positive(request.AmountReceived, nameof(request.AmountReceived), 18, 2);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 500);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var item = await db.PettyCashRequests.Include(candidate => candidate.Disbursement)
            .SingleOrDefaultAsync(candidate => candidate.Id == id)
            ?? throw new KeyNotFoundException("The petty-cash request was not found.");
        if (item.Status != PettyCashStatuses.Disbursed || item.Disbursement is null)
            throw new InvalidOperationException("Only a recorded petty-cash handover can be confirmed.");
        if (item.RequestedByUserId != actorUserId)
            throw new UnauthorizedAccessException("The requesting Supervisor must confirm receipt.");
        await RequireProjectAccessAsync(actorUserId, item.ProjectId);
        if (amountReceived != item.Disbursement.Amount)
            throw new ArgumentException("The received amount must equal the recorded handover amount. Ask Finance to resolve any difference before confirming.");
        if (await db.PettyCashReceiptConfirmations.AnyAsync(candidate =>
            candidate.PettyCashRequestId == item.Id || candidate.PettyCashDisbursementId == item.Disbursement.Id))
            throw new InvalidOperationException("Receipt of this petty-cash handover has already been confirmed.");
        var now = DateTime.UtcNow;
        var confirmation = new PettyCashReceiptConfirmation
        {
            ConfirmationNumber = Reference("PCRC", now), PettyCashRequestId = item.Id,
            PettyCashDisbursementId = item.Disbursement.Id, AmountReceived = amountReceived,
            Notes = notes, ConfirmedByUserId = actorUserId, ConfirmedAt = now
        };
        db.PettyCashReceiptConfirmations.Add(confirmation);
        await db.SaveChangesAsync();
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashReceiptConfirmation", confirmation.Id,
            confirmation.ConfirmationNumber, "PettyCashReceiptConfirmed", actorUserId, actorRole,
            new { amountReceived, notes }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    public async Task<PettyCashRequestResponseDto> SubmitReconciliationAsync(
        long id, SubmitPettyCashReconciliationDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Supervisor");
        var spent = InputNormalizer.NonNegative(request.AmountSpent, nameof(request.AmountSpent), 18, 2);
        var returned = InputNormalizer.NonNegative(request.AmountReturned, nameof(request.AmountReturned), 18, 2);
        var evidence = InputNormalizer.RequiredText(request.EvidenceReference, nameof(request.EvidenceReference), 3, 500);
        var returnReference = InputNormalizer.OptionalText(request.ReturnReference, nameof(request.ReturnReference), 100);
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var item = await db.PettyCashRequests.Include(candidate => candidate.Disbursement)
            .Include(candidate => candidate.ReceiptConfirmation)
            .Include(candidate => candidate.Reconciliations)
            .SingleOrDefaultAsync(candidate => candidate.Id == id) ?? throw new KeyNotFoundException("The petty-cash request was not found.");
        if (item.Status != PettyCashStatuses.Disbursed) throw new InvalidOperationException("Only disbursed petty cash can be reconciled.");
        if (item.RequestedByUserId != actorUserId) throw new UnauthorizedAccessException("The requesting Supervisor must submit the accountability evidence.");
        if (item.Disbursement is null) throw new InvalidOperationException("No petty-cash disbursement exists.");
        if (item.ReceiptConfirmation is null)
            throw new InvalidOperationException("Confirm receipt of the petty cash before submitting receipts and returned funds.");
        if (item.Reconciliations.Any(candidate => candidate.Status == PettyCashReconciliationStatuses.Approved))
            throw new InvalidOperationException("This petty-cash request has already been reconciled.");
        if (spent + returned != item.Disbursement.Amount) throw new ArgumentException("Amount spent plus amount returned must equal the disbursed amount.");
        if (returned > 0 && string.IsNullOrWhiteSpace(returnReference)) throw new ArgumentException("A cash-return reference is required when money is returned.");
        var now = DateTime.UtcNow;
        var reconciliation = new PettyCashReconciliation
        {
            ReconciliationNumber = Reference("PCRN", now), PettyCashRequestId = item.Id,
            AmountSpent = spent, AmountReturned = returned, EvidenceReference = evidence,
            ReturnReference = returnReference, Notes = notes, SubmittedByUserId = actorUserId, SubmittedAt = now
        };
        db.PettyCashReconciliations.Add(reconciliation);
        item.Status = PettyCashStatuses.ReconciliationSubmitted;
        await db.SaveChangesAsync();
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashReconciliation", reconciliation.Id,
            reconciliation.ReconciliationNumber, "PettyCashAccountabilitySubmitted", actorUserId, actorRole,
            new { spent, returned, evidence, returnReference, notes }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    public async Task<PettyCashRequestResponseDto> ReviewReconciliationAsync(
        long id, ReviewPettyCashReconciliationDto request, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Finance Officer");
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var item = await db.PettyCashRequests.Include(candidate => candidate.Reconciliations)
            .Include(candidate => candidate.Disbursement)
            .SingleOrDefaultAsync(candidate => candidate.Id == id) ?? throw new KeyNotFoundException("The petty-cash request was not found.");
        if (item.Status != PettyCashStatuses.ReconciliationSubmitted) throw new InvalidOperationException("No petty-cash reconciliation is awaiting review.");
        var reconciliation = item.Reconciliations.Single(candidate => candidate.Status == PettyCashReconciliationStatuses.PendingReview);
        if (reconciliation.SubmittedByUserId == actorUserId) throw new UnauthorizedAccessException("The person submitting evidence cannot review it.");
        await RequireProjectAccessAsync(actorUserId, item.ProjectId);
        CashAccount? returnAccount = null;
        if (request.Approve && reconciliation.AmountReturned > 0 && item.Disbursement is not null)
        {
            var sourceEntry = await db.CashLedgerEntries.AsNoTracking()
                .SingleOrDefaultAsync(entry =>
                    entry.ReferenceType == "PettyCashDisbursement"
                    && entry.ReferenceId == item.Disbursement.Id
                    && entry.EntryType == "PettyCashDisbursement");
            if (sourceEntry is not null)
            {
                returnAccount = await db.CashAccounts
                    .FromSqlInterpolated($"SELECT * FROM \"CashAccounts\" WHERE \"Id\" = {sourceEntry.CashAccountId} FOR UPDATE")
                    .SingleAsync();
            }
        }
        var now = DateTime.UtcNow;
        reconciliation.Status = request.Approve ? PettyCashReconciliationStatuses.Approved : PettyCashReconciliationStatuses.Returned;
        reconciliation.ReviewedByUserId = actorUserId;
        reconciliation.ReviewedAt = now;
        reconciliation.ReviewNotes = notes;
        reconciliation.AmountExpensed = request.Approve ? reconciliation.AmountSpent : null;
        if (request.Approve)
        {
            item.AmountCommitted = reconciliation.AmountSpent;
            if (returnAccount is not null)
            {
                returnAccount.Balance += reconciliation.AmountReturned;
                returnAccount.UpdatedAt = now;
                db.CashLedgerEntries.Add(new CashLedgerEntry
                {
                    EntryNumber = Reference("CASH", now),
                    CashAccountId = returnAccount.Id,
                    ProjectId = item.ProjectId,
                    AmountDelta = reconciliation.AmountReturned,
                    BalanceAfter = returnAccount.Balance,
                    EntryType = "CashReturn",
                    ReferenceType = "PettyCashReconciliation",
                    ReferenceId = reconciliation.Id,
                    ReferenceNumber = reconciliation.ReconciliationNumber,
                    PostedByUserId = actorUserId,
                    PostedAt = now,
                    Notes = reconciliation.ReturnReference
                });
            }
        }
        db.PettyCashReconciliationEvents.Add(new PettyCashReconciliationEvent
        {
            PettyCashReconciliationId = reconciliation.Id,
            EventType = request.Approve ? "Approved" : "Returned",
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            Notes = notes,
            OccurredAt = now
        });
        item.Status = request.Approve ? PettyCashStatuses.Reconciled : PettyCashStatuses.Disbursed;
        await _events.AppendAsync(Chain(item.Id), null, item.ProjectId, "PettyCashReconciliation", reconciliation.Id,
            reconciliation.ReconciliationNumber, request.Approve ? "PettyCashReconciled" : "PettyCashAccountabilityReturned",
            actorUserId, actorRole, new { notes }, now);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadAsync(item.Id);
    }

    private static IQueryable<PettyCashRequest> RequestQuery(IQueryable<PettyCashRequest> query) => query
        .Include(item => item.Project).Include(item => item.CostCode).Include(item => item.RequestedByUser)
        .Include(item => item.FinanceApprovedByUser).Include(item => item.Disbursement).ThenInclude(item => item!.DisbursedByUser)
        .Include(item => item.ReceiptConfirmation).ThenInclude(item => item!.ConfirmedByUser)
        .Include(item => item.Reconciliations).ThenInclude(item => item.SubmittedByUser)
        .Include(item => item.Reconciliations).ThenInclude(item => item.ReviewedByUser).AsSplitQuery();

    private async Task<PettyCashRequestResponseDto> LoadAsync(long id) =>
        ToDto(await RequestQuery(db.PettyCashRequests.AsNoTracking()).SingleAsync(item => item.Id == id));

    private static PettyCashRequestResponseDto ToDto(PettyCashRequest item)
    {
        var latest = item.Reconciliations.OrderByDescending(candidate => candidate.SubmittedAt).FirstOrDefault();
        return new PettyCashRequestResponseDto
        {
            Id = item.Id, RequestNumber = item.RequestNumber, ProjectId = item.ProjectId, ProjectName = item.Project.Name,
            CostCodeId = item.CostCodeId, CostCode = item.CostCode.Code, CostCodeName = item.CostCode.Name,
            Purpose = item.Purpose, AmountRequested = item.AmountRequested, AmountApproved = item.AmountApproved,
            AmountCommitted = item.AmountCommitted,
            NeededByDate = item.NeededByDate, Status = item.Status, RequestedByName = item.RequestedByUser.FullName,
            RequestedByUserId = item.RequestedByUserId, RequestedAt = item.RequestedAt,
            FinanceApprovedByUserId = item.FinanceApprovedByUserId,
            FinanceApprovedByName = item.FinanceApprovedByUser?.FullName, FinanceDecisionAt = item.FinanceDecisionAt,
            FinanceDecisionNotes = item.FinanceDecisionNotes,
            Disbursement = item.Disbursement is null ? null : new PettyCashDisbursementResponseDto
            {
                Id = item.Disbursement.Id, DisbursementNumber = item.Disbursement.DisbursementNumber,
                Amount = item.Disbursement.Amount, Method = item.Disbursement.Method,
                ExternalReference = item.Disbursement.ExternalReference, RecipientName = item.Disbursement.RecipientName,
                RecipientAcknowledgementReference = item.Disbursement.RecipientAcknowledgementReference,
                EvidenceReference = item.Disbursement.EvidenceReference,
                DisbursedByUserId = item.Disbursement.DisbursedByUserId,
                DisbursedByName = item.Disbursement.DisbursedByUser.FullName,
                DisbursedAt = item.Disbursement.DisbursedAt
            },
            ReceiptConfirmation = item.ReceiptConfirmation is null ? null : new PettyCashReceiptConfirmationResponseDto
            {
                Id = item.ReceiptConfirmation.Id,
                ConfirmationNumber = item.ReceiptConfirmation.ConfirmationNumber,
                AmountReceived = item.ReceiptConfirmation.AmountReceived,
                Notes = item.ReceiptConfirmation.Notes,
                ConfirmedByUserId = item.ReceiptConfirmation.ConfirmedByUserId,
                ConfirmedByName = item.ReceiptConfirmation.ConfirmedByUser.FullName,
                ConfirmedAt = item.ReceiptConfirmation.ConfirmedAt
            },
            LatestReconciliation = latest is null ? null : new PettyCashReconciliationResponseDto
            {
                Id = latest.Id, ReconciliationNumber = latest.ReconciliationNumber, AmountSpent = latest.AmountSpent,
                AmountReturned = latest.AmountReturned,
                AmountUnaccounted = (item.Disbursement?.Amount ?? 0) - latest.AmountSpent - latest.AmountReturned,
                AmountExpensed = latest.AmountExpensed,
                EvidenceReference = latest.EvidenceReference, ReturnReference = latest.ReturnReference, Notes = latest.Notes,
                SubmittedByName = latest.SubmittedByUser.FullName, SubmittedAt = latest.SubmittedAt, Status = latest.Status,
                ReviewedByName = latest.ReviewedByUser?.FullName, ReviewedAt = latest.ReviewedAt, ReviewNotes = latest.ReviewNotes
            }
        };
    }

    private async Task<ActorRoleContext> RequireAnyRoleAsync(int userId, string claimedRole, params string[] allowed)
    {
        var actor = await roles.ResolveAsync(userId);
        if (actor is null || actor.EffectiveRole != claimedRole || !allowed.Contains(actor.EffectiveRole))
            throw new UnauthorizedAccessException($"This action requires one of these roles: {string.Join(", ", allowed)}.");
        return actor;
    }

    private async Task RequireProjectAccessAsync(int userId, int projectId)
    {
        var actor = await roles.ResolveAsync(userId);
        if (actor is null)
            throw new UnauthorizedAccessException("The active account could not be verified.");
        if (!actor.CanSwitchRoles && actor.EffectiveRole is not ("CEO" or "Auditor")
            && !await db.UserProjectAssignments.AsNoTracking().AnyAsync(item =>
                item.UserId == userId && item.ProjectId == projectId && item.IsActive))
            throw new UnauthorizedAccessException("You are not assigned to this project.");
    }

    private async Task<CashAccount?> ResolveCashAccountForPostingAsync(
        int projectId,
        long? cashAccountId,
        decimal amount)
    {
        if (!cashAccountId.HasValue)
        {
            if (await db.CashAccounts.AsNoTracking().AnyAsync(item => item.ProjectId == projectId))
                throw new ArgumentException("Select the project cash account used for this handover.", nameof(cashAccountId));
            return null;
        }
        if (cashAccountId <= 0)
            throw new ArgumentException("Cash-account ID must be positive.", nameof(cashAccountId));

        var account = await db.CashAccounts
            .FromSqlInterpolated($"SELECT * FROM \"CashAccounts\" WHERE \"Id\" = {cashAccountId.Value} AND \"ProjectId\" = {projectId} FOR UPDATE")
            .SingleOrDefaultAsync()
            ?? throw new KeyNotFoundException("The selected project cash account was not found.");
        if (account.Balance < amount)
            throw new InvalidOperationException($"The selected cash account has insufficient funds. Available balance: KES {account.Balance:N2}.");
        return account;
    }

    private async Task<bool> HasUnreconciledRequestAsync(int userId) =>
        await db.PettyCashRequests.AsNoTracking().AnyAsync(item =>
            item.RequestedByUserId == userId
            && item.Status != PettyCashStatuses.Reconciled
            && item.Status != PettyCashStatuses.Rejected);

    private static string Reference(string prefix, DateTime now) => $"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..30];
    private static string Chain(long id) => $"PETTY-{id}";
    private static PaginatedResult<T> Page<T>(IReadOnlyList<T> items, int total, int page, int pageSize) => new()
    { Items = items, TotalCount = total, Page = page, PageSize = pageSize };
}
