namespace ConstructionMS.Infrastructure.Services.Controls;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Controls;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Controls;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Security.Cryptography;

public sealed class ControlWorkspaceService : IControlWorkspaceService
{
    private static readonly TimeSpan BusinessUtcOffset = TimeSpan.FromHours(3);

    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _roles;
    private readonly ControlEventWriter _events;

    public ControlWorkspaceService(AppDbContext db, IActorRoleResolver roles)
    {
        _db = db;
        _roles = roles;
        _events = new ControlEventWriter(db);
    }

    public async Task<IReadOnlyList<CashAccountResponseDto>> GetCashAccountsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = _db.CashAccounts.AsNoTracking().Include(item => item.Project).AsQueryable();
        query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.ProjectId);
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        return await query.OrderBy(item => item.Project.Name).ThenBy(item => item.Name)
            .Select(item => new CashAccountResponseDto
            {
                Id = item.Id,
                ProjectId = item.ProjectId,
                ProjectName = item.Project.Name,
                Name = item.Name,
                Balance = item.Balance,
                UpdatedAt = item.UpdatedAt
            })
            .ToListAsync();
    }

    public async Task<IReadOnlyList<OpeningPositionResponseDto>> GetOpeningPositionsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = OpeningPositionQuery(_db.OpeningPositionBatches.AsNoTracking());
        query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.ProjectId);
        if (actorRole is "Storekeeper" or "Supervisor")
            query = query.Where(item => item.PositionType == OpeningPositionTypes.Inventory);
        else if (actorRole == "Finance Officer")
            query = query.Where(item => item.PositionType == OpeningPositionTypes.Cash);
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        return (await query.OrderByDescending(item => item.SubmittedAt).Take(250).ToListAsync())
            .Select(ToDto).ToList();
    }

    public async Task<OpeningPositionResponseDto> CreateOpeningPositionAsync(
        CreateOpeningPositionRequestDto request, int actorUserId, string actorRole)
    {
        var positionType = NormalizeOpeningType(request.PositionType);
        var requiredRole = positionType == OpeningPositionTypes.Inventory ? "Storekeeper" : "Finance Officer";
        await RequireRoleAsync(actorUserId, actorRole, requiredRole);
        var projectId = InputNormalizer.Positive(request.ProjectId, nameof(request.ProjectId));
        await RequireProjectAccessAsync(actorUserId, projectId);
        if (request.AsOfDate == default || request.AsOfDate > BusinessToday())
            throw new ArgumentException("The opening-position date must be today or earlier.", nameof(request.AsOfDate));
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);

        if (!await _db.Projects.AsNoTracking().AnyAsync(item => item.Id == projectId && item.Status == "Active"))
            throw new KeyNotFoundException("The active project was not found.");

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var periodScope = positionType == OpeningPositionTypes.Inventory
            ? OperationalPeriodScopes.Inventory
            : OperationalPeriodScopes.Finance;
        if (await _db.OperationalPeriods.AnyAsync(item =>
                item.ProjectId == projectId
                && item.Scope == periodScope
                && item.StartDate <= request.AsOfDate
                && item.EndDate >= request.AsOfDate
                && (item.Status == OperationalPeriodStatuses.AwaitingClose
                    || item.Status == OperationalPeriodStatuses.Closed)))
            throw new InvalidOperationException("An opening position cannot be added inside a period that is closing or closed.");
        var now = DateTime.UtcNow;
        var batch = new OpeningPositionBatch
        {
            BatchNumber = Reference(positionType == OpeningPositionTypes.Inventory ? "OPI" : "OPC", now),
            PositionType = positionType,
            ProjectId = projectId,
            AsOfDate = request.AsOfDate,
            Notes = notes,
            EvidenceReference = evidence,
            SubmittedByUserId = actorUserId,
            SubmittedAt = now,
            Status = positionType == OpeningPositionTypes.Inventory
                ? OpeningPositionStatuses.AwaitingVerification
                : OpeningPositionStatuses.AwaitingApproval
        };

        if (positionType == OpeningPositionTypes.Inventory)
        {
            if (request.InventoryLines.Count == 0)
                throw new ArgumentException("At least one material is required.", nameof(request.InventoryLines));
            if (request.CashLines.Count != 0)
                throw new ArgumentException("Cash lines are not valid in an inventory opening position.", nameof(request.CashLines));
            if (request.InventoryLines.Select(item => item.MaterialId).Distinct().Count() != request.InventoryLines.Count)
                throw new ArgumentException("Each material can appear only once in a batch.", nameof(request.InventoryLines));

            var materialIds = request.InventoryLines.Select(item => InputNormalizer.Positive(item.MaterialId, nameof(item.MaterialId))).ToList();
            var activeMaterialIds = await _db.Materials.AsNoTracking()
                .Where(item => materialIds.Contains(item.Id))
                .Select(item => item.Id).ToListAsync();
            if (activeMaterialIds.Count != materialIds.Count)
                throw new KeyNotFoundException("One or more active materials were not found.");
            if (await _db.StockLedgerEntries.AnyAsync(item => item.ProjectId == projectId && materialIds.Contains(item.MaterialId))
                || await _db.StockBalances.AnyAsync(item => item.ProjectId == projectId && materialIds.Contains(item.MaterialId)))
                throw new InvalidOperationException("Opening stock can be submitted only before that project/material has stock history.");
            if (await _db.OpeningInventoryLines.AnyAsync(item =>
                    item.OpeningPositionBatch.ProjectId == projectId
                    && materialIds.Contains(item.MaterialId)
                    && item.OpeningPositionBatch.Status != OpeningPositionStatuses.Rejected))
                throw new InvalidOperationException("An opening position already exists for one or more selected materials.");

            batch.InventoryLines = request.InventoryLines.Select(item => new OpeningInventoryLine
            {
                MaterialId = item.MaterialId,
                Quantity = InputNormalizer.Positive(item.Quantity, nameof(item.Quantity), 18, 3),
                UnitCost = item.UnitCost.HasValue
                    ? InputNormalizer.NonNegative(item.UnitCost.Value, nameof(item.UnitCost), 18, 2)
                    : null
            }).ToList();
        }
        else
        {
            if (request.CashLines.Count == 0)
                throw new ArgumentException("At least one cash account is required.", nameof(request.CashLines));
            if (request.InventoryLines.Count != 0)
                throw new ArgumentException("Material lines are not valid in a cash opening position.", nameof(request.InventoryLines));
            var normalizedNames = request.CashLines
                .Select(item => InputNormalizer.RequiredText(item.AccountName, nameof(item.AccountName), 2, 100))
                .ToList();
            if (normalizedNames.Distinct(StringComparer.OrdinalIgnoreCase).Count() != normalizedNames.Count)
                throw new ArgumentException("Each cash account can appear only once in a batch.", nameof(request.CashLines));
            var existingNames = await _db.CashAccounts.AsNoTracking()
                .Where(item => item.ProjectId == projectId)
                .Select(item => item.Name.ToLower()).ToListAsync();
            if (normalizedNames.Any(name => existingNames.Contains(name.ToLowerInvariant())))
                throw new InvalidOperationException("An opening balance already exists for one or more selected cash accounts.");
            var normalizedLowerNames = normalizedNames.Select(name => name.ToLowerInvariant()).ToList();
            if (await _db.OpeningCashLines.AnyAsync(item =>
                    item.OpeningPositionBatch.ProjectId == projectId
                    && normalizedLowerNames.Contains(item.AccountName.ToLower())
                    && item.OpeningPositionBatch.Status != OpeningPositionStatuses.Rejected))
                throw new InvalidOperationException("An opening position already exists for one or more selected cash accounts.");

            batch.CashLines = request.CashLines.Select((item, index) => new OpeningCashLine
            {
                AccountName = normalizedNames[index],
                Amount = InputNormalizer.NonNegative(item.Amount, nameof(item.Amount), 18, 2)
            }).ToList();
        }

        _db.OpeningPositionBatches.Add(batch);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"OPEN-{batch.Id}", null, projectId, "OpeningPosition", batch.Id,
            batch.BatchNumber, "OpeningPositionSubmitted", actorUserId, actorRole,
            new { positionType, request.AsOfDate, lineCount = positionType == OpeningPositionTypes.Inventory ? request.InventoryLines.Count : request.CashLines.Count }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadOpeningPositionAsync(batch.Id);
    }

    public async Task<OpeningPositionResponseDto> VerifyOpeningPositionAsync(
        long id, OpeningPositionDecisionRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        if (id <= 0) throw new ArgumentException("Opening-position ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("OpeningPositionBatches", id);
        var batch = await OpeningPositionQuery(_db.OpeningPositionBatches).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The opening position was not found.");
        if (batch.PositionType != OpeningPositionTypes.Inventory
            || batch.Status != OpeningPositionStatuses.AwaitingVerification)
            throw new InvalidOperationException("This opening-stock batch is not awaiting Supervisor verification.");
        await RequireProjectAccessAsync(actorUserId, batch.ProjectId);
        if (batch.SubmittedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The submitter cannot verify the opening stock.");

        var now = DateTime.UtcNow;
        batch.Status = request.Approve
            ? OpeningPositionStatuses.AwaitingApproval
            : OpeningPositionStatuses.Rejected;
        _db.OpeningPositionVerifications.Add(new OpeningPositionVerification
        {
            OpeningPositionBatchId = batch.Id,
            Outcome = request.Approve ? "Verified" : "Rejected",
            Notes = notes,
            VerifiedByUserId = actorUserId,
            VerifiedAt = now
        });
        await _events.AppendAsync($"OPEN-{batch.Id}", null, batch.ProjectId, "OpeningPosition", batch.Id,
            batch.BatchNumber, request.Approve ? "OpeningStockVerified" : "OpeningStockRejected",
            actorUserId, actorRole, new { notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadOpeningPositionAsync(batch.Id);
    }

    public async Task<OpeningPositionResponseDto> DecideOpeningPositionAsync(
        long id, OpeningPositionDecisionRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "CEO");
        if (id <= 0) throw new ArgumentException("Opening-position ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("OpeningPositionBatches", id);
        var batch = await OpeningPositionQuery(_db.OpeningPositionBatches).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The opening position was not found.");
        if (batch.Status != OpeningPositionStatuses.AwaitingApproval)
            throw new InvalidOperationException("This opening position already has a decision.");
        if (batch.SubmittedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The submitter cannot approve the opening position.");
        if (batch.PositionType == OpeningPositionTypes.Inventory
            && batch.Verification?.VerifiedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The opening-stock verifier cannot approve the same opening position.");

        var now = DateTime.UtcNow;
        var outcome = request.Approve ? OpeningPositionStatuses.Approved : OpeningPositionStatuses.Rejected;
        batch.Status = outcome;
        _db.OpeningPositionDecisions.Add(new OpeningPositionDecision
        {
            OpeningPositionBatchId = batch.Id,
            Outcome = outcome,
            Notes = notes,
            DecidedByUserId = actorUserId,
            DecidedAt = now
        });

        if (request.Approve)
        {
            if (batch.PositionType == OpeningPositionTypes.Inventory)
            {
                var materialIds = batch.InventoryLines.Select(item => item.MaterialId).ToList();
                if (await _db.StockLedgerEntries.AnyAsync(item => item.ProjectId == batch.ProjectId && materialIds.Contains(item.MaterialId))
                    || await _db.StockBalances.AnyAsync(item => item.ProjectId == batch.ProjectId && materialIds.Contains(item.MaterialId)))
                    throw new InvalidOperationException("Stock history was added after submission. Reject this batch and reconcile it separately.");
                foreach (var line in batch.InventoryLines)
                {
                    _db.StockBalances.Add(new StockBalance
                    {
                        ProjectId = batch.ProjectId,
                        MaterialId = line.MaterialId,
                        QuantityOnHand = line.Quantity,
                        UpdatedAt = now
                    });
                    _db.StockLedgerEntries.Add(new StockLedgerEntry
                    {
                        ProjectId = batch.ProjectId,
                        MaterialId = line.MaterialId,
                        MovementType = "OpeningBalance",
                        QuantityDelta = line.Quantity,
                        BalanceAfter = line.Quantity,
                        ReferenceType = "OpeningPosition",
                        ReferenceId = batch.Id,
                        ReferenceNumber = batch.BatchNumber,
                        ActorUserId = actorUserId,
                        Notes = notes,
                        OccurredAt = now
                    });
                }
            }
            else
            {
                foreach (var line in batch.CashLines)
                {
                    if (await _db.CashAccounts.AnyAsync(item => item.ProjectId == batch.ProjectId && item.Name.ToLower() == line.AccountName.ToLower()))
                        throw new InvalidOperationException($"Cash account '{line.AccountName}' was added after submission.");
                    var account = new CashAccount
                    {
                        ProjectId = batch.ProjectId,
                        Name = line.AccountName,
                        Balance = line.Amount,
                        UpdatedAt = now
                    };
                    _db.CashAccounts.Add(account);
                    await _db.SaveChangesAsync();
                    _db.CashLedgerEntries.Add(new CashLedgerEntry
                    {
                        EntryNumber = Reference("CASH", now),
                        CashAccountId = account.Id,
                        ProjectId = batch.ProjectId,
                        AmountDelta = line.Amount,
                        BalanceAfter = line.Amount,
                        EntryType = "OpeningBalance",
                        ReferenceType = "OpeningPosition",
                        ReferenceId = batch.Id,
                        ReferenceNumber = batch.BatchNumber,
                        PostedByUserId = actorUserId,
                        PostedAt = now,
                        Notes = notes
                    });
                }
            }
            _db.OpeningPositionPostings.Add(new OpeningPositionPosting
            {
                OpeningPositionBatchId = batch.Id,
                PostedByUserId = actorUserId,
                PostedAt = now
            });
        }

        await _events.AppendAsync($"OPEN-{batch.Id}", null, batch.ProjectId, "OpeningPosition", batch.Id,
            batch.BatchNumber, request.Approve ? "OpeningPositionApproved" : "OpeningPositionRejected",
            actorUserId, actorRole, new { batch.PositionType, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadOpeningPositionAsync(batch.Id);
    }

    public async Task<IReadOnlyList<MaterialReturnResponseDto>> GetMaterialReturnsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Foreman", "Supervisor", "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = MaterialReturnQuery(_db.MaterialReturns.AsNoTracking());
        if (actorRole == "Foreman" && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => item.ReturnedByUserId == actorUserId);
        else
            query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.MaterialIssue.ProjectId);
        if (projectId.HasValue) query = query.Where(item => item.MaterialIssue.ProjectId == projectId.Value);
        return (await query.OrderByDescending(item => item.ReturnedAt).Take(250).ToListAsync()).Select(ToDto).ToList();
    }

    public async Task<MaterialIssueDisputeResolutionResponseDto> ResolveMaterialIssueDisputeAsync(
        long materialIssueId,
        ResolveMaterialIssueDisputeRequestDto request,
        int actorUserId,
        string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        if (materialIssueId <= 0)
            throw new ArgumentException("Material issue ID must be positive.", nameof(materialIssueId));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("MaterialIssues", materialIssueId);
        var issue = await _db.MaterialIssues.SingleOrDefaultAsync(item => item.Id == materialIssueId)
            ?? throw new KeyNotFoundException("The material issue was not found.");
        if (issue.Status != MaterialIssueStatuses.Disputed || !issue.ConfirmedQuantity.HasValue)
            throw new InvalidOperationException("This material handover is not awaiting dispute resolution.");
        await RequireProjectAccessAsync(actorUserId, issue.ProjectId);
        if (actorUserId == issue.IssuedByUserId || actorUserId == issue.ConfirmedByUserId)
            throw new UnauthorizedAccessException("The issuer and recipient cannot resolve their own quantity dispute.");
        if (await _db.MaterialIssueDisputeResolutions.AnyAsync(item => item.MaterialIssueId == issue.Id))
            throw new InvalidOperationException("This handover dispute already has a resolution.");

        var returnedToStore = issue.QuantityIssued - issue.ConfirmedQuantity.Value;
        if (returnedToStore <= 0)
            throw new InvalidOperationException("The disputed quantity is not lower than the issued quantity.");
        var balance = await _db.StockBalances.SingleOrDefaultAsync(item =>
            item.ProjectId == issue.ProjectId && item.MaterialId == issue.MaterialId)
            ?? throw new InvalidOperationException("The project store balance was not found.");
        var now = DateTime.UtcNow;
        var resolution = new MaterialIssueDisputeResolution
        {
            ResolutionNumber = Reference("MDR", now),
            MaterialIssueId = issue.Id,
            IssuedQuantity = issue.QuantityIssued,
            ForemanReceivedQuantity = issue.ConfirmedQuantity.Value,
            ReturnedToStoreQuantity = returnedToStore,
            Notes = notes,
            EvidenceReference = evidence,
            ResolvedByUserId = actorUserId,
            ResolvedAt = now
        };
        _db.MaterialIssueDisputeResolutions.Add(resolution);
        await _db.SaveChangesAsync();
        balance.QuantityOnHand += returnedToStore;
        balance.UpdatedAt = now;
        _db.StockLedgerEntries.Add(new StockLedgerEntry
        {
            ProjectId = issue.ProjectId,
            MaterialId = issue.MaterialId,
            MovementType = "HandoverCorrection",
            QuantityDelta = returnedToStore,
            BalanceAfter = balance.QuantityOnHand,
            ReferenceType = "MaterialIssueDisputeResolution",
            ReferenceId = resolution.Id,
            ReferenceNumber = resolution.ResolutionNumber,
            ActorUserId = actorUserId,
            Notes = notes,
            OccurredAt = now
        });
        issue.Status = MaterialIssueStatuses.Confirmed;
        await _events.AppendAsync($"REQ-{issue.RequisitionId}", issue.RequisitionId, issue.ProjectId,
            "MaterialIssueDisputeResolution", resolution.Id, resolution.ResolutionNumber,
            "MaterialHandoverDisputeResolved", actorUserId, actorRole,
            new
            {
                issuedQuantity = issue.QuantityIssued,
                foremanReceivedQuantity = issue.ConfirmedQuantity.Value,
                returnedToStoreQuantity = returnedToStore,
                notes
            }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadDisputeResolutionAsync(resolution.Id);
    }

    public async Task<MaterialReturnResponseDto> CreateMaterialReturnAsync(
        CreateMaterialReturnRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Foreman");
        if (request.MaterialIssueId <= 0) throw new ArgumentException("Material issue ID must be positive.", nameof(request.MaterialIssueId));
        var quantity = InputNormalizer.Positive(request.Quantity, nameof(request.Quantity), 18, 3);
        var condition = InputNormalizer.RequiredText(request.Condition, nameof(request.Condition), 2, 30);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("MaterialIssues", request.MaterialIssueId);
        var issue = await _db.MaterialIssues.Include(item => item.UsageRecords)
            .SingleOrDefaultAsync(item => item.Id == request.MaterialIssueId)
            ?? throw new KeyNotFoundException("The material issue was not found.");
        if (issue.IssuedToUserId != actorUserId)
            throw new UnauthorizedAccessException("Only the recorded recipient can return this material.");
        if (issue.Status != MaterialIssueStatuses.Confirmed)
            throw new InvalidOperationException("Only a confirmed handover can be returned to Stores.");
        if (await _db.MaterialCustodyCloseouts.AnyAsync(item => item.MaterialIssueId == issue.Id && item.Status != CustodyCloseoutStatuses.Returned))
            throw new InvalidOperationException("This issue has an active or approved custody close-out.");
        var used = issue.UsageRecords.Sum(item => item.Quantity);
        var acceptedReturns = await _db.MaterialReturns
            .Where(item => item.MaterialIssueId == issue.Id && item.Status == MaterialReturnStatuses.Received)
            .SumAsync(item => item.QuantityAccepted ?? 0);
        var pendingReturns = await _db.MaterialReturns
            .Where(item => item.MaterialIssueId == issue.Id && item.Status == MaterialReturnStatuses.AwaitingReceipt)
            .SumAsync(item => item.QuantityOffered);
        var available = (issue.ConfirmedQuantity ?? 0) - used - acceptedReturns - pendingReturns;
        if (quantity > available)
            throw new InvalidOperationException("The return quantity exceeds the material still in this Foreman's custody.");

        var now = DateTime.UtcNow;
        var materialReturn = new MaterialReturn
        {
            ReturnNumber = Reference("MRT", now),
            MaterialIssueId = issue.Id,
            QuantityOffered = quantity,
            Condition = condition,
            Notes = notes,
            EvidenceReference = evidence,
            ReturnedByUserId = actorUserId,
            ReturnedAt = now,
            Status = MaterialReturnStatuses.AwaitingReceipt
        };
        _db.MaterialReturns.Add(materialReturn);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"REQ-{issue.RequisitionId}", issue.RequisitionId, issue.ProjectId,
            "MaterialReturn", materialReturn.Id, materialReturn.ReturnNumber, "MaterialReturnSubmitted",
            actorUserId, actorRole, new { quantity, condition }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadMaterialReturnAsync(materialReturn.Id);
    }

    public async Task<MaterialReturnResponseDto> ReceiveMaterialReturnAsync(
        long id, ReceiveMaterialReturnRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        if (id <= 0) throw new ArgumentException("Material return ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        var accepted = request.Accept ? InputNormalizer.Positive(request.QuantityAccepted, nameof(request.QuantityAccepted), 18, 3) : 0;
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("MaterialReturns", id);
        var materialReturn = await MaterialReturnQuery(_db.MaterialReturns).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The material return was not found.");
        if (materialReturn.Status != MaterialReturnStatuses.AwaitingReceipt)
            throw new InvalidOperationException("This return already has a Stores decision.");
        await RequireProjectAccessAsync(actorUserId, materialReturn.MaterialIssue.ProjectId);
        if (materialReturn.ReturnedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The person returning material cannot receive it into Stores.");
        if (request.Accept && accepted != materialReturn.QuantityOffered)
            throw new ArgumentException("The accepted quantity must equal the offered quantity. Reject and ask the Foreman to submit the actual quantity.", nameof(request.QuantityAccepted));
        var now = DateTime.UtcNow;
        materialReturn.Status = request.Accept ? MaterialReturnStatuses.Received : MaterialReturnStatuses.Rejected;
        materialReturn.QuantityAccepted = accepted;
        materialReturn.ReceivedByUserId = actorUserId;
        materialReturn.ReceiptNotes = notes;
        materialReturn.ReceiptEvidenceReference = evidence;
        materialReturn.ReceivedAt = now;
        if (request.Accept)
        {
            var balance = await _db.StockBalances.SingleOrDefaultAsync(item =>
                item.ProjectId == materialReturn.MaterialIssue.ProjectId
                && item.MaterialId == materialReturn.MaterialIssue.MaterialId)
                ?? throw new InvalidOperationException("The project store balance was not found.");
            balance.QuantityOnHand += accepted;
            balance.UpdatedAt = now;
            _db.StockLedgerEntries.Add(new StockLedgerEntry
            {
                ProjectId = balance.ProjectId,
                MaterialId = balance.MaterialId,
                MovementType = "ReturnToStore",
                QuantityDelta = accepted,
                BalanceAfter = balance.QuantityOnHand,
                ReferenceType = "MaterialReturn",
                ReferenceId = materialReturn.Id,
                ReferenceNumber = materialReturn.ReturnNumber,
                ActorUserId = actorUserId,
                Notes = notes,
                OccurredAt = now
            });
        }
        await _events.AppendAsync($"REQ-{materialReturn.MaterialIssue.RequisitionId}", materialReturn.MaterialIssue.RequisitionId,
            materialReturn.MaterialIssue.ProjectId, "MaterialReturn", materialReturn.Id, materialReturn.ReturnNumber,
            request.Accept ? "MaterialReturnReceived" : "MaterialReturnRejected", actorUserId, actorRole,
            new { quantityOffered = materialReturn.QuantityOffered, quantityAccepted = accepted, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadMaterialReturnAsync(materialReturn.Id);
    }

    public async Task<IReadOnlyList<CustodyCloseoutResponseDto>> GetCustodyCloseoutsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Foreman", "Supervisor", "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = CustodyCloseoutQuery(_db.MaterialCustodyCloseouts.AsNoTracking());
        if (actorRole == "Foreman" && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => item.SubmittedByUserId == actorUserId);
        else
            query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.MaterialIssue.ProjectId);
        if (projectId.HasValue) query = query.Where(item => item.MaterialIssue.ProjectId == projectId.Value);
        return (await query.OrderByDescending(item => item.SubmittedAt).Take(250).ToListAsync()).Select(ToDto).ToList();
    }

    public async Task<CustodyCloseoutResponseDto> SubmitCustodyCloseoutAsync(
        SubmitCustodyCloseoutRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Foreman");
        if (request.MaterialIssueId <= 0) throw new ArgumentException("Material issue ID must be positive.", nameof(request.MaterialIssueId));
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("MaterialIssues", request.MaterialIssueId);
        var issue = await _db.MaterialIssues.Include(item => item.UsageRecords)
            .SingleOrDefaultAsync(item => item.Id == request.MaterialIssueId)
            ?? throw new KeyNotFoundException("The material issue was not found.");
        if (issue.IssuedToUserId != actorUserId)
            throw new UnauthorizedAccessException("Only the recorded recipient can close this custody record.");
        if (issue.Status != MaterialIssueStatuses.Confirmed)
            throw new InvalidOperationException("The material handover must be confirmed before close-out.");
        if (await _db.MaterialReturns.AnyAsync(item => item.MaterialIssueId == issue.Id && item.Status == MaterialReturnStatuses.AwaitingReceipt))
            throw new InvalidOperationException("Wait for Stores to receive or reject the pending material return.");
        if (await _db.MaterialCustodyCloseouts.AnyAsync(item =>
                item.MaterialIssueId == issue.Id && item.Status != CustodyCloseoutStatuses.Returned))
            throw new InvalidOperationException("This issue already has an active or approved close-out.");
        var used = issue.UsageRecords.Where(item => item.UsageType == "Used").Sum(item => item.Quantity);
        var wasted = issue.UsageRecords.Where(item => item.UsageType == "Wastage").Sum(item => item.Quantity);
        var returned = await _db.MaterialReturns
            .Where(item => item.MaterialIssueId == issue.Id && item.Status == MaterialReturnStatuses.Received)
            .SumAsync(item => item.QuantityAccepted ?? 0);
        var confirmed = issue.ConfirmedQuantity ?? 0;
        var unaccounted = confirmed - used - wasted - returned;
        if (unaccounted != 0)
            throw new InvalidOperationException($"{unaccounted:0.###} remains in site custody. Record its use, wastage, or return before close-out.");
        var revision = (await _db.MaterialCustodyCloseouts
            .Where(item => item.MaterialIssueId == issue.Id)
            .MaxAsync(item => (int?)item.Revision) ?? 0) + 1;
        var now = DateTime.UtcNow;
        var closeout = new MaterialCustodyCloseout
        {
            CloseoutNumber = Reference("MCO", now),
            MaterialIssueId = issue.Id,
            Revision = revision,
            ConfirmedQuantity = confirmed,
            UsedQuantity = used,
            WastedQuantity = wasted,
            ReturnedQuantity = returned,
            UnaccountedQuantity = unaccounted,
            Notes = notes,
            EvidenceReference = evidence,
            SubmittedByUserId = actorUserId,
            SubmittedAt = now,
            Status = CustodyCloseoutStatuses.AwaitingReview
        };
        _db.MaterialCustodyCloseouts.Add(closeout);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"REQ-{issue.RequisitionId}", issue.RequisitionId, issue.ProjectId,
            "MaterialCustodyCloseout", closeout.Id, closeout.CloseoutNumber, "CustodyCloseoutSubmitted",
            actorUserId, actorRole, new { confirmed, used, wasted, returned, unaccounted, revision }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCustodyCloseoutAsync(closeout.Id);
    }

    public async Task<CustodyCloseoutResponseDto> ReviewCustodyCloseoutAsync(
        long id, ReviewCustodyCloseoutRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        if (id <= 0) throw new ArgumentException("Custody close-out ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("MaterialCustodyCloseouts", id);
        var closeout = await CustodyCloseoutQuery(_db.MaterialCustodyCloseouts).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The custody close-out was not found.");
        if (closeout.Status != CustodyCloseoutStatuses.AwaitingReview)
            throw new InvalidOperationException("This close-out already has a decision.");
        await RequireProjectAccessAsync(actorUserId, closeout.MaterialIssue.ProjectId);
        if (closeout.SubmittedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The submitter cannot review the custody close-out.");
        if (request.Approve && closeout.UnaccountedQuantity != 0)
            throw new InvalidOperationException("A close-out with unexplained material cannot be approved.");
        var now = DateTime.UtcNow;
        var outcome = request.Approve ? CustodyCloseoutStatuses.Approved : CustodyCloseoutStatuses.Returned;
        closeout.Status = outcome;
        _db.MaterialCustodyCloseoutDecisions.Add(new MaterialCustodyCloseoutDecision
        {
            MaterialCustodyCloseoutId = closeout.Id,
            Outcome = outcome,
            Notes = notes,
            DecidedByUserId = actorUserId,
            DecidedAt = now
        });
        await _events.AppendAsync($"REQ-{closeout.MaterialIssue.RequisitionId}", closeout.MaterialIssue.RequisitionId,
            closeout.MaterialIssue.ProjectId, "MaterialCustodyCloseout", closeout.Id, closeout.CloseoutNumber,
            request.Approve ? "CustodyCloseoutApproved" : "CustodyCloseoutReturned", actorUserId, actorRole,
            new { closeout.Revision, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCustodyCloseoutAsync(closeout.Id);
    }

    public async Task<IReadOnlyList<OperationalPeriodResponseDto>> GetPeriodsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = OperationalPeriodQuery(_db.OperationalPeriods.AsNoTracking());
        query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.ProjectId);
        if (actorRole is "Storekeeper" or "Supervisor")
            query = query.Where(item => item.Scope == OperationalPeriodScopes.Inventory);
        else if (actorRole == "Finance Officer")
            query = query.Where(item => item.Scope == OperationalPeriodScopes.Finance);
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        return (await query.OrderByDescending(item => item.EndDate).ThenByDescending(item => item.Id).Take(250).ToListAsync())
            .Select(ToDto).ToList();
    }

    public async Task<OperationalPeriodResponseDto> CreatePeriodAsync(
        CreateOperationalPeriodRequestDto request, int actorUserId, string actorRole)
    {
        var scope = NormalizePeriodScope(request.Scope);
        var requiredRole = scope == OperationalPeriodScopes.Inventory ? "Supervisor" : "Finance Officer";
        await RequireRoleAsync(actorUserId, actorRole, requiredRole);
        var projectId = InputNormalizer.Positive(request.ProjectId, nameof(request.ProjectId));
        await RequireProjectAccessAsync(actorUserId, projectId);
        var name = InputNormalizer.RequiredText(request.Name, nameof(request.Name), 2, 100);
        if (request.StartDate == default || request.EndDate == default || request.StartDate > request.EndDate)
            throw new ArgumentException("The period start date must be on or before its end date.");
        if (!await _db.Projects.AsNoTracking().AnyAsync(item => item.Id == projectId && item.Status == "Active"))
            throw new KeyNotFoundException("The active project was not found.");
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        if (await _db.OperationalPeriods.AnyAsync(item => item.ProjectId == projectId && item.Scope == scope
                && item.StartDate <= request.EndDate && item.EndDate >= request.StartDate))
            throw new InvalidOperationException("This date range overlaps another period for the same project and scope.");
        var now = DateTime.UtcNow;
        var period = new OperationalPeriod
        {
            PeriodNumber = Reference(scope == OperationalPeriodScopes.Inventory ? "PER-I" : "PER-F", now),
            ProjectId = projectId,
            Scope = scope,
            Name = name,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Status = OperationalPeriodStatuses.Open,
            CreatedByUserId = actorUserId,
            CreatedAt = now
        };
        _db.OperationalPeriods.Add(period);
        await _db.SaveChangesAsync();
        _db.OperationalPeriodEvents.Add(new OperationalPeriodEvent
        {
            OperationalPeriodId = period.Id, SequenceNumber = 1, EventType = "Opened", Notes = name,
            ActorUserId = actorUserId, ActorRole = actorRole, OccurredAt = now
        });
        await _events.AppendAsync($"PERIOD-{period.Id}", null, period.ProjectId, "OperationalPeriod", period.Id,
            period.PeriodNumber, "PeriodOpened", actorUserId, actorRole,
            new { scope, request.StartDate, request.EndDate }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadPeriodAsync(period.Id);
    }

    public async Task<OperationalPeriodResponseDto> SubmitPeriodCloseAsync(
        long id, PeriodActionRequestDto request, int actorUserId, string actorRole)
    {
        if (id <= 0) throw new ArgumentException("Period ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("OperationalPeriods", id);
        var period = await _db.OperationalPeriods.SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The period was not found.");
        var requiredRole = period.Scope == OperationalPeriodScopes.Inventory ? "Supervisor" : "Finance Officer";
        await RequireRoleAsync(actorUserId, actorRole, requiredRole);
        await RequireProjectAccessAsync(actorUserId, period.ProjectId);
        if (period.Status is not (OperationalPeriodStatuses.Open or OperationalPeriodStatuses.Returned))
            throw new InvalidOperationException("Only an open or returned period can be submitted for closing.");
        if (period.EndDate >= BusinessToday())
            throw new InvalidOperationException("A period can be submitted for closing only after its end date has passed.");
        var blockers = await GetPeriodBlockersAsync(period);
        if (blockers.Count != 0)
            throw new InvalidOperationException("Resolve before closing: " + string.Join("; ", blockers));
        var now = DateTime.UtcNow;
        period.Status = OperationalPeriodStatuses.AwaitingClose;
        var sequence = (await _db.OperationalPeriodEvents.Where(item => item.OperationalPeriodId == id)
            .MaxAsync(item => (int?)item.SequenceNumber) ?? 0) + 1;
        _db.OperationalPeriodEvents.Add(new OperationalPeriodEvent
        {
            OperationalPeriodId = period.Id, SequenceNumber = sequence, EventType = "CloseSubmitted", Notes = notes,
            ActorUserId = actorUserId, ActorRole = actorRole, OccurredAt = now
        });
        await _events.AppendAsync($"PERIOD-{period.Id}", null, period.ProjectId, "OperationalPeriod", period.Id,
            period.PeriodNumber, "PeriodCloseSubmitted", actorUserId, actorRole, new { period.Scope, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadPeriodAsync(period.Id);
    }

    public async Task<OperationalPeriodResponseDto> DecidePeriodCloseAsync(
        long id, PeriodDecisionRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "CEO");
        if (id <= 0) throw new ArgumentException("Period ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("OperationalPeriods", id);
        var period = await _db.OperationalPeriods.Include(item => item.Events).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The period was not found.");
        if (period.Status != OperationalPeriodStatuses.AwaitingClose)
            throw new InvalidOperationException("This period is not awaiting a close decision.");
        if (period.Events.Any(item => item.EventType == "CloseSubmitted" && item.ActorUserId == actorUserId))
            throw new UnauthorizedAccessException("The person submitting a period cannot approve its close.");
        if (request.Approve)
        {
            var blockers = await GetPeriodBlockersAsync(period);
            if (blockers.Count != 0)
                throw new InvalidOperationException("New unresolved records were found: " + string.Join("; ", blockers));
        }
        var now = DateTime.UtcNow;
        period.Status = request.Approve ? OperationalPeriodStatuses.Closed : OperationalPeriodStatuses.Returned;
        var sequence = (period.Events.Max(item => (int?)item.SequenceNumber) ?? 0) + 1;
        _db.OperationalPeriodEvents.Add(new OperationalPeriodEvent
        {
            OperationalPeriodId = period.Id, SequenceNumber = sequence,
            EventType = request.Approve ? "Closed" : "CloseReturned", Notes = notes,
            ActorUserId = actorUserId, ActorRole = actorRole, OccurredAt = now
        });
        await _events.AppendAsync($"PERIOD-{period.Id}", null, period.ProjectId, "OperationalPeriod", period.Id,
            period.PeriodNumber, request.Approve ? "PeriodClosed" : "PeriodCloseReturned",
            actorUserId, actorRole, new { period.Scope, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadPeriodAsync(period.Id);
    }

    public async Task<IReadOnlyList<ControlledCorrectionResponseDto>> GetCorrectionsAsync(
        int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");
        ValidateOptionalProjectId(projectId);
        var query = CorrectionQuery(_db.ControlledCorrections.AsNoTracking());
        query = await ScopeByProjectAsync(query, actorUserId, actorRole, item => item.ProjectId);
        if (actorRole is "Storekeeper" or "Supervisor")
            query = query.Where(item => item.CorrectionType == ControlledCorrectionTypes.Inventory);
        else if (actorRole == "Finance Officer")
            query = query.Where(item => item.CorrectionType == ControlledCorrectionTypes.Finance);
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        return (await query.OrderByDescending(item => item.SubmittedAt).Take(250).ToListAsync()).Select(ToDto).ToList();
    }

    public async Task<ControlledCorrectionResponseDto> CreateCorrectionAsync(
        CreateControlledCorrectionRequestDto request, int actorUserId, string actorRole)
    {
        if (request.OperationalPeriodId <= 0) throw new ArgumentException("Period ID must be positive.", nameof(request.OperationalPeriodId));
        var correctionType = NormalizeCorrectionType(request.CorrectionType);
        var requiredRole = correctionType == ControlledCorrectionTypes.Inventory ? "Storekeeper" : "Finance Officer";
        await RequireRoleAsync(actorUserId, actorRole, requiredRole);
        var reason = InputNormalizer.RequiredText(request.Reason, nameof(request.Reason), 3, 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        EnsureSignedPrecision(request.QuantityDelta, nameof(request.QuantityDelta), 18, 3);
        EnsureSignedPrecision(request.AmountDelta, nameof(request.AmountDelta), 18, 2);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var period = await _db.OperationalPeriods.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == request.OperationalPeriodId)
            ?? throw new KeyNotFoundException("The closed period was not found.");
        if (period.Status != OperationalPeriodStatuses.Closed)
            throw new InvalidOperationException("Corrections can be raised only against a closed period.");
        if (period.Scope != correctionType)
            throw new ArgumentException("The correction type must match the period scope.", nameof(request.CorrectionType));
        await RequireProjectAccessAsync(actorUserId, period.ProjectId);

        int? materialId = null;
        string? accountName = null;
        if (correctionType == ControlledCorrectionTypes.Inventory)
        {
            if (!request.MaterialId.HasValue || request.MaterialId <= 0 || request.QuantityDelta == 0 || request.AmountDelta != 0)
                throw new ArgumentException("Inventory corrections require one material and a non-zero quantity only.");
            materialId = request.MaterialId.Value;
            if (!await _db.Materials.AsNoTracking().AnyAsync(item => item.Id == materialId))
                throw new KeyNotFoundException("The active material was not found.");
        }
        else
        {
            if (request.AmountDelta == 0 || request.QuantityDelta != 0)
                throw new ArgumentException("Finance corrections require a non-zero amount only.");
            accountName = InputNormalizer.RequiredText(request.CashAccountName, nameof(request.CashAccountName), 2, 100);
            if (!await _db.CashAccounts.AsNoTracking().AnyAsync(item =>
                    item.ProjectId == period.ProjectId && item.Name.ToLower() == accountName.ToLower()))
                throw new KeyNotFoundException("The project cash account was not found.");
        }

        var now = DateTime.UtcNow;
        var correction = new ControlledCorrection
        {
            CorrectionNumber = Reference(correctionType == ControlledCorrectionTypes.Inventory ? "COR-I" : "COR-F", now),
            OperationalPeriodId = period.Id,
            ProjectId = period.ProjectId,
            CorrectionType = correctionType,
            MaterialId = materialId,
            CashAccountName = accountName,
            QuantityDelta = request.QuantityDelta,
            AmountDelta = request.AmountDelta,
            Reason = reason,
            EvidenceReference = evidence,
            Status = ControlledCorrectionStatuses.AwaitingApproval,
            SubmittedByUserId = actorUserId,
            SubmittedAt = now
        };
        _db.ControlledCorrections.Add(correction);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"CORRECTION-{correction.Id}", null, correction.ProjectId,
            "ControlledCorrection", correction.Id, correction.CorrectionNumber, "CorrectionSubmitted",
            actorUserId, actorRole, new { correctionType, correction.QuantityDelta, correction.AmountDelta, reason }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCorrectionAsync(correction.Id);
    }

    public async Task<ControlledCorrectionResponseDto> DecideCorrectionAsync(
        long id, CorrectionDecisionRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "CEO");
        if (id <= 0) throw new ArgumentException("Correction ID must be positive.", nameof(id));
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockRowAsync("ControlledCorrections", id);
        var correction = await CorrectionQuery(_db.ControlledCorrections).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The correction was not found.");
        if (correction.Status != ControlledCorrectionStatuses.AwaitingApproval)
            throw new InvalidOperationException("This correction already has a decision.");
        if (correction.SubmittedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The submitter cannot approve the correction.");
        var now = DateTime.UtcNow;
        var outcome = request.Approve ? ControlledCorrectionStatuses.Approved : ControlledCorrectionStatuses.Rejected;
        correction.Status = outcome;
        _db.ControlledCorrectionDecisions.Add(new ControlledCorrectionDecision
        {
            ControlledCorrectionId = correction.Id,
            Outcome = outcome,
            Notes = notes,
            DecidedByUserId = actorUserId,
            DecidedAt = now
        });
        if (request.Approve && correction.CorrectionType == ControlledCorrectionTypes.Inventory)
        {
            var balance = await _db.StockBalances.SingleOrDefaultAsync(item =>
                item.ProjectId == correction.ProjectId && item.MaterialId == correction.MaterialId)
                ?? throw new InvalidOperationException("The project store balance was not found.");
            if (balance.QuantityOnHand + correction.QuantityDelta < 0)
                throw new InvalidOperationException("The approved correction would make the store balance negative.");
            balance.QuantityOnHand += correction.QuantityDelta;
            balance.UpdatedAt = now;
            _db.StockLedgerEntries.Add(new StockLedgerEntry
            {
                ProjectId = correction.ProjectId,
                MaterialId = correction.MaterialId!.Value,
                MovementType = "ControlledCorrection",
                QuantityDelta = correction.QuantityDelta,
                BalanceAfter = balance.QuantityOnHand,
                ReferenceType = "ControlledCorrection",
                ReferenceId = correction.Id,
                ReferenceNumber = correction.CorrectionNumber,
                ActorUserId = actorUserId,
                Notes = $"{correction.Reason}. {notes}",
                OccurredAt = now
            });
        }
        else if (request.Approve)
        {
            var accountName = correction.CashAccountName!;
            var account = await _db.CashAccounts.SingleAsync(item =>
                item.ProjectId == correction.ProjectId && item.Name.ToLower() == accountName.ToLower());
            if (account.Balance + correction.AmountDelta < 0)
                throw new InvalidOperationException("The approved correction would make the cash-account balance negative.");
            account.Balance += correction.AmountDelta;
            account.UpdatedAt = now;
            _db.CashLedgerEntries.Add(new CashLedgerEntry
            {
                EntryNumber = Reference("CASH", now),
                CashAccountId = account.Id,
                ProjectId = correction.ProjectId,
                AmountDelta = correction.AmountDelta,
                BalanceAfter = account.Balance,
                EntryType = "ControlledCorrection",
                ReferenceType = "ControlledCorrection",
                ReferenceId = correction.Id,
                ReferenceNumber = correction.CorrectionNumber,
                PostedByUserId = actorUserId,
                PostedAt = now,
                Notes = $"{correction.Reason}. {notes}"
            });
        }
        await _events.AppendAsync($"CORRECTION-{correction.Id}", null, correction.ProjectId,
            "ControlledCorrection", correction.Id, correction.CorrectionNumber,
            request.Approve ? "CorrectionApproved" : "CorrectionRejected", actorUserId, actorRole,
            new { correction.CorrectionType, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCorrectionAsync(correction.Id);
    }

    private async Task<IReadOnlyList<string>> GetPeriodBlockersAsync(OperationalPeriod period)
    {
        var endExclusive = BusinessDayEndExclusiveUtc(period.EndDate);
        var blockers = new List<string>();
        var openingType = period.Scope == OperationalPeriodScopes.Inventory
            ? OpeningPositionTypes.Inventory
            : OpeningPositionTypes.Cash;
        var pendingOpeningPositions = await _db.OpeningPositionBatches.CountAsync(item =>
            item.ProjectId == period.ProjectId
            && item.PositionType == openingType
            && item.AsOfDate <= period.EndDate
            && (item.Status == OpeningPositionStatuses.AwaitingVerification
                || item.Status == OpeningPositionStatuses.AwaitingApproval));
        var pendingCorrections = await _db.ControlledCorrections.CountAsync(item =>
            item.ProjectId == period.ProjectId
            && item.CorrectionType == period.Scope
            && item.SubmittedAt < endExclusive
            && item.Status == ControlledCorrectionStatuses.AwaitingApproval);
        if (pendingOpeningPositions > 0)
            blockers.Add($"{pendingOpeningPositions} opening position(s) awaiting a decision");
        if (pendingCorrections > 0)
            blockers.Add($"{pendingCorrections} controlled correction(s) awaiting a decision");

        if (period.Scope == OperationalPeriodScopes.Inventory)
        {
            var unclosedCustody = await _db.MaterialIssues.CountAsync(item =>
                item.ProjectId == period.ProjectId && item.IssuedAt < endExclusive
                && item.Status != MaterialIssueStatuses.Disputed
                && !item.MaterialCustodyCloseouts.Any(closeout => closeout.Status == CustodyCloseoutStatuses.Approved));
            var disputedCustody = await _db.MaterialIssues.CountAsync(item =>
                item.ProjectId == period.ProjectId && item.IssuedAt < endExclusive
                && item.Status == MaterialIssueStatuses.Disputed);
            var pendingTransfers = await _db.StockTransfers.CountAsync(item =>
                (item.FromProjectId == period.ProjectId || item.ToProjectId == period.ProjectId)
                && item.RequestedAt < endExclusive
                && item.Status != StockTransferStatuses.Received
                && item.Status != StockTransferStatuses.Resolved);
            var pendingCounts = await _db.StockCounts.CountAsync(item =>
                item.ProjectId == period.ProjectId && item.CountedAt < endExclusive
                && item.Status == StockCountStatuses.AwaitingReview);
            var technicalCandidates = await _db.GoodsReceipts.AsNoTracking()
                .Where(item => item.ProjectId == period.ProjectId && item.ReceivedAt < endExclusive
                    && item.PurchaseOrderLine.RequiresTechnicalAcceptance && item.AcceptedQuantity > 0)
                .Select(item => new
                {
                    item.PurchaseOrderLineId,
                    OrderedQuantity = item.PurchaseOrderLine.Quantity,
                    LatestOutcome = item.TechnicalAcceptances
                        .OrderByDescending(review => review.ReviewSequence)
                        .Select(review => review.Outcome)
                        .FirstOrDefault()
                })
                .ToListAsync();
            var unresolvedTechnicalLines = technicalCandidates
                .Where(item => item.LatestOutcome != TechnicalAcceptanceOutcomes.Accepted)
                .GroupBy(item => item.PurchaseOrderLineId)
                .ToList();
            var pendingTechnical = 0;
            if (unresolvedTechnicalLines.Count != 0)
            {
                var lineIds = unresolvedTechnicalLines.Select(group => group.Key).ToList();
                var acceptedByLine = await _db.GoodsReceipts.AsNoTracking()
                    .Where(item => lineIds.Contains(item.PurchaseOrderLineId)
                        && item.AcceptedQuantity > 0
                        && item.TechnicalAcceptances
                            .OrderByDescending(review => review.ReviewSequence)
                            .Select(review => review.Outcome)
                            .FirstOrDefault() == TechnicalAcceptanceOutcomes.Accepted)
                    .GroupBy(item => item.PurchaseOrderLineId)
                    .Select(group => new
                    {
                        PurchaseOrderLineId = group.Key,
                        Quantity = group.Sum(item => item.AcceptedQuantity)
                    })
                    .ToDictionaryAsync(item => item.PurchaseOrderLineId, item => item.Quantity);
                pendingTechnical = unresolvedTechnicalLines.Count(group =>
                    acceptedByLine.GetValueOrDefault(group.Key) < group.First().OrderedQuantity);
            }
            if (unclosedCustody > 0) blockers.Add($"{unclosedCustody} custody record(s) not closed");
            if (disputedCustody > 0) blockers.Add($"{disputedCustody} disputed handover(s)");
            if (pendingTransfers > 0) blockers.Add($"{pendingTransfers} transfer(s) not completed");
            if (pendingCounts > 0) blockers.Add($"{pendingCounts} stock count(s) awaiting review");
            if (pendingTechnical > 0) blockers.Add($"{pendingTechnical} delivery check(s) pending");
        }
        else
        {
            var pendingInvoices = await _db.SupplierInvoices.CountAsync(item =>
                item.ProjectId == period.ProjectId && item.CapturedAt < endExclusive
                && item.Status != InvoiceStatuses.Paid && item.Status != InvoiceStatuses.Rejected
                && item.Status != InvoiceStatuses.Returned && item.Status != InvoiceStatuses.Mismatch);
            var pendingPettyCash = await _db.PettyCashRequests.CountAsync(item =>
                item.ProjectId == period.ProjectId && item.RequestedAt < endExclusive
                && item.Status != PettyCashStatuses.Reconciled && item.Status != PettyCashStatuses.Rejected);
            if (pendingInvoices > 0) blockers.Add($"{pendingInvoices} supplier invoice(s) not completed");
            if (pendingPettyCash > 0) blockers.Add($"{pendingPettyCash} petty-cash record(s) not reconciled");
        }
        return blockers;
    }

    private async Task RequireRoleAsync(int userId, string claimedRole, string requiredRole) =>
        await RequireAnyRoleAsync(userId, claimedRole, requiredRole);

    private async Task RequireAnyRoleAsync(int userId, string claimedRole, params string[] allowed)
    {
        var actor = await _roles.ResolveAsync(userId);
        if (actor is null || actor.EffectiveRole != claimedRole || !allowed.Contains(actor.EffectiveRole))
            throw new UnauthorizedAccessException($"This action requires one of these roles: {string.Join(", ", allowed)}.");
    }

    private async Task RequireProjectAccessAsync(int userId, int projectId)
    {
        if (!await CanVerifyAllProjectsAsync(userId)
            && !await _db.UserProjectAssignments.AsNoTracking().AnyAsync(item =>
                item.UserId == userId && item.ProjectId == projectId && item.IsActive))
            throw new UnauthorizedAccessException("You are not assigned to this project.");
    }

    private async Task<bool> CanVerifyAllProjectsAsync(int userId) =>
        (await _roles.ResolveAsync(userId))?.CanSwitchRoles == true;

    private async Task<IQueryable<TEntity>> ScopeByProjectAsync<TEntity>(
        IQueryable<TEntity> query,
        int userId,
        string role,
        System.Linq.Expressions.Expression<Func<TEntity, int>> projectId)
    {
        if (role is "CEO" or "Auditor" || await CanVerifyAllProjectsAsync(userId)) return query;
        var assignedProjectIds = _db.UserProjectAssignments.AsNoTracking()
            .Where(item => item.UserId == userId && item.IsActive)
            .Select(item => item.ProjectId);
        return query.Where(BuildContainsExpression(projectId, assignedProjectIds));
    }

    private static System.Linq.Expressions.Expression<Func<TEntity, bool>> BuildContainsExpression<TEntity>(
        System.Linq.Expressions.Expression<Func<TEntity, int>> selector,
        IQueryable<int> values)
    {
        var contains = System.Linq.Expressions.Expression.Call(
            typeof(Queryable), nameof(Queryable.Contains), [typeof(int)],
            values.Expression, selector.Body);
        return System.Linq.Expressions.Expression.Lambda<Func<TEntity, bool>>(contains, selector.Parameters);
    }

    private async Task LockRowAsync(string tableName, long id)
    {
        var sql = tableName switch
        {
            "OpeningPositionBatches" => "SELECT 1 FROM \"OpeningPositionBatches\" WHERE \"Id\" = {0} FOR UPDATE",
            "MaterialIssues" => "SELECT 1 FROM \"MaterialIssues\" WHERE \"Id\" = {0} FOR UPDATE",
            "MaterialReturns" => "SELECT 1 FROM \"MaterialReturns\" WHERE \"Id\" = {0} FOR UPDATE",
            "MaterialCustodyCloseouts" => "SELECT 1 FROM \"MaterialCustodyCloseouts\" WHERE \"Id\" = {0} FOR UPDATE",
            "OperationalPeriods" => "SELECT 1 FROM \"OperationalPeriods\" WHERE \"Id\" = {0} FOR UPDATE",
            "ControlledCorrections" => "SELECT 1 FROM \"ControlledCorrections\" WHERE \"Id\" = {0} FOR UPDATE",
            _ => throw new ArgumentOutOfRangeException(nameof(tableName))
        };
        await _db.Database.ExecuteSqlRawAsync(sql, id);
    }

    private async Task<OpeningPositionResponseDto> LoadOpeningPositionAsync(long id) =>
        ToDto(await OpeningPositionQuery(_db.OpeningPositionBatches.AsNoTracking()).SingleAsync(item => item.Id == id));

    private async Task<MaterialReturnResponseDto> LoadMaterialReturnAsync(long id) =>
        ToDto(await MaterialReturnQuery(_db.MaterialReturns.AsNoTracking()).SingleAsync(item => item.Id == id));

    private async Task<MaterialIssueDisputeResolutionResponseDto> LoadDisputeResolutionAsync(long id) =>
        ToDto(await _db.MaterialIssueDisputeResolutions.AsNoTracking()
            .Include(item => item.MaterialIssue).ThenInclude(item => item.Project)
            .Include(item => item.MaterialIssue).ThenInclude(item => item.Material)
            .Include(item => item.ResolvedByUser)
            .SingleAsync(item => item.Id == id));

    private async Task<CustodyCloseoutResponseDto> LoadCustodyCloseoutAsync(long id) =>
        ToDto(await CustodyCloseoutQuery(_db.MaterialCustodyCloseouts.AsNoTracking()).SingleAsync(item => item.Id == id));

    private async Task<OperationalPeriodResponseDto> LoadPeriodAsync(long id) =>
        ToDto(await OperationalPeriodQuery(_db.OperationalPeriods.AsNoTracking()).SingleAsync(item => item.Id == id));

    private async Task<ControlledCorrectionResponseDto> LoadCorrectionAsync(long id) =>
        ToDto(await CorrectionQuery(_db.ControlledCorrections.AsNoTracking()).SingleAsync(item => item.Id == id));

    private static IQueryable<OpeningPositionBatch> OpeningPositionQuery(IQueryable<OpeningPositionBatch> query) => query
        .Include(item => item.Project).Include(item => item.SubmittedByUser)
        .Include(item => item.InventoryLines).ThenInclude(item => item.Material)
        .Include(item => item.CashLines)
        .Include(item => item.Verification).ThenInclude(item => item!.VerifiedByUser)
        .Include(item => item.Decision).ThenInclude(item => item!.DecidedByUser)
        .AsSplitQuery();

    private static IQueryable<MaterialReturn> MaterialReturnQuery(IQueryable<MaterialReturn> query) => query
        .Include(item => item.MaterialIssue).ThenInclude(item => item.Project)
        .Include(item => item.MaterialIssue).ThenInclude(item => item.Material)
        .Include(item => item.ReturnedByUser).Include(item => item.ReceivedByUser);

    private static IQueryable<MaterialCustodyCloseout> CustodyCloseoutQuery(IQueryable<MaterialCustodyCloseout> query) => query
        .Include(item => item.MaterialIssue).ThenInclude(item => item.Project)
        .Include(item => item.MaterialIssue).ThenInclude(item => item.Material)
        .Include(item => item.SubmittedByUser)
        .Include(item => item.Decision).ThenInclude(item => item!.DecidedByUser);

    private static IQueryable<OperationalPeriod> OperationalPeriodQuery(IQueryable<OperationalPeriod> query) => query
        .Include(item => item.Project).Include(item => item.CreatedByUser)
        .Include(item => item.Events).ThenInclude(item => item.ActorUser)
        .AsSplitQuery();

    private static IQueryable<ControlledCorrection> CorrectionQuery(IQueryable<ControlledCorrection> query) => query
        .Include(item => item.OperationalPeriod).Include(item => item.Project).Include(item => item.Material)
        .Include(item => item.SubmittedByUser)
        .Include(item => item.Decision).ThenInclude(item => item!.DecidedByUser);

    private static OpeningPositionResponseDto ToDto(OpeningPositionBatch item) => new()
    {
        Id = item.Id, BatchNumber = item.BatchNumber, PositionType = item.PositionType,
        ProjectId = item.ProjectId, ProjectName = item.Project.Name, AsOfDate = item.AsOfDate,
        Notes = item.Notes, EvidenceReference = item.EvidenceReference, Status = item.Status,
        SubmittedByName = item.SubmittedByUser.FullName, SubmittedAt = item.SubmittedAt,
        VerifiedByName = item.Verification?.VerifiedByUser.FullName,
        VerificationNotes = item.Verification?.Notes,
        VerifiedAt = item.Verification?.VerifiedAt,
        DecidedByName = item.Decision?.DecidedByUser.FullName, DecisionNotes = item.Decision?.Notes,
        DecidedAt = item.Decision?.DecidedAt,
        InventoryLines = item.InventoryLines.OrderBy(line => line.Material.Name).Select(line => new OpeningInventoryLineResponseDto
        {
            MaterialId = line.MaterialId, MaterialName = line.Material.Name, Unit = line.Material.Unit,
            Quantity = line.Quantity, UnitCost = line.UnitCost
        }).ToList(),
        CashLines = item.CashLines.OrderBy(line => line.AccountName).Select(line => new OpeningCashLineResponseDto
        {
            AccountName = line.AccountName, Amount = line.Amount
        }).ToList()
    };

    private static MaterialReturnResponseDto ToDto(MaterialReturn item) => new()
    {
        Id = item.Id, ReturnNumber = item.ReturnNumber, MaterialIssueId = item.MaterialIssueId,
        ProjectId = item.MaterialIssue.ProjectId, ProjectName = item.MaterialIssue.Project.Name,
        MaterialName = item.MaterialIssue.Material.Name, Unit = item.MaterialIssue.Material.Unit,
        QuantityOffered = item.QuantityOffered, QuantityAccepted = item.QuantityAccepted,
        Condition = item.Condition, Status = item.Status, ReturnedByName = item.ReturnedByUser.FullName,
        ReturnedAt = item.ReturnedAt, ReceivedByName = item.ReceivedByUser?.FullName, ReceivedAt = item.ReceivedAt,
        Notes = item.Notes, EvidenceReference = item.EvidenceReference
    };

    private static MaterialIssueDisputeResolutionResponseDto ToDto(MaterialIssueDisputeResolution item) => new()
    {
        Id = item.Id,
        ResolutionNumber = item.ResolutionNumber,
        MaterialIssueId = item.MaterialIssueId,
        ProjectId = item.MaterialIssue.ProjectId,
        ProjectName = item.MaterialIssue.Project.Name,
        MaterialName = item.MaterialIssue.Material.Name,
        Unit = item.MaterialIssue.Material.Unit,
        IssuedQuantity = item.IssuedQuantity,
        ForemanReceivedQuantity = item.ForemanReceivedQuantity,
        ReturnedToStoreQuantity = item.ReturnedToStoreQuantity,
        Notes = item.Notes,
        EvidenceReference = item.EvidenceReference,
        ResolvedByName = item.ResolvedByUser.FullName,
        ResolvedAt = item.ResolvedAt
    };

    private static CustodyCloseoutResponseDto ToDto(MaterialCustodyCloseout item) => new()
    {
        Id = item.Id, CloseoutNumber = item.CloseoutNumber, MaterialIssueId = item.MaterialIssueId,
        Revision = item.Revision, ProjectId = item.MaterialIssue.ProjectId, ProjectName = item.MaterialIssue.Project.Name,
        MaterialName = item.MaterialIssue.Material.Name, Unit = item.MaterialIssue.Material.Unit,
        ConfirmedQuantity = item.ConfirmedQuantity, UsedQuantity = item.UsedQuantity,
        WastedQuantity = item.WastedQuantity, ReturnedQuantity = item.ReturnedQuantity,
        UnaccountedQuantity = item.UnaccountedQuantity, Status = item.Status,
        SubmittedByName = item.SubmittedByUser.FullName, SubmittedAt = item.SubmittedAt,
        Notes = item.Notes, EvidenceReference = item.EvidenceReference,
        DecidedByName = item.Decision?.DecidedByUser.FullName, DecisionNotes = item.Decision?.Notes,
        DecidedAt = item.Decision?.DecidedAt
    };

    private static OperationalPeriodResponseDto ToDto(OperationalPeriod item)
    {
        var latest = item.Events.OrderByDescending(entry => entry.SequenceNumber).FirstOrDefault();
        return new OperationalPeriodResponseDto
        {
            Id = item.Id, PeriodNumber = item.PeriodNumber, ProjectId = item.ProjectId,
            ProjectName = item.Project.Name, Scope = item.Scope, Name = item.Name,
            StartDate = item.StartDate, EndDate = item.EndDate, Status = item.Status,
            CreatedByName = item.CreatedByUser.FullName, CreatedAt = item.CreatedAt,
            LatestEventType = latest?.EventType, LatestEventNotes = latest?.Notes,
            LatestActorName = latest?.ActorUser.FullName, LatestEventAt = latest?.OccurredAt
        };
    }

    private static ControlledCorrectionResponseDto ToDto(ControlledCorrection item) => new()
    {
        Id = item.Id, CorrectionNumber = item.CorrectionNumber, OperationalPeriodId = item.OperationalPeriodId,
        PeriodName = item.OperationalPeriod.Name, ProjectId = item.ProjectId, ProjectName = item.Project.Name,
        CorrectionType = item.CorrectionType, MaterialId = item.MaterialId, MaterialName = item.Material?.Name,
        Unit = item.Material?.Unit, CashAccountName = item.CashAccountName,
        QuantityDelta = item.QuantityDelta, AmountDelta = item.AmountDelta, Reason = item.Reason,
        EvidenceReference = item.EvidenceReference, Status = item.Status,
        SubmittedByName = item.SubmittedByUser.FullName, SubmittedAt = item.SubmittedAt,
        DecidedByName = item.Decision?.DecidedByUser.FullName, DecisionNotes = item.Decision?.Notes,
        DecidedAt = item.Decision?.DecidedAt
    };

    private static string NormalizeOpeningType(string value)
    {
        var normalized = InputNormalizer.RequiredText(value, nameof(value), 2, 20);
        return normalized.Equals(OpeningPositionTypes.Inventory, StringComparison.OrdinalIgnoreCase)
            ? OpeningPositionTypes.Inventory
            : normalized.Equals(OpeningPositionTypes.Cash, StringComparison.OrdinalIgnoreCase)
                ? OpeningPositionTypes.Cash
                : throw new ArgumentException("Position type must be Inventory or Cash.", nameof(value));
    }

    private static string NormalizePeriodScope(string value)
    {
        var normalized = InputNormalizer.RequiredText(value, nameof(value), 2, 20);
        return normalized.Equals(OperationalPeriodScopes.Inventory, StringComparison.OrdinalIgnoreCase)
            ? OperationalPeriodScopes.Inventory
            : normalized.Equals(OperationalPeriodScopes.Finance, StringComparison.OrdinalIgnoreCase)
                ? OperationalPeriodScopes.Finance
                : throw new ArgumentException("Period scope must be Inventory or Finance.", nameof(value));
    }

    private static string NormalizeCorrectionType(string value) => NormalizePeriodScope(value);

    private static void ValidateOptionalProjectId(int? projectId)
    {
        if (projectId is <= 0) throw new ArgumentException("Project ID must be positive.", nameof(projectId));
    }

    private static void EnsureSignedPrecision(decimal value, string name, int precision, int scale)
    {
        if (!DecimalPrecision.Fits(value, precision, scale))
            throw new ArgumentOutOfRangeException(name, $"The value must fit within {precision} digits and {scale} decimal places.");
    }

    private static DateOnly BusinessToday() =>
        DateOnly.FromDateTime(DateTime.UtcNow + BusinessUtcOffset);

    private static DateTime BusinessDayEndExclusiveUtc(DateOnly date) =>
        new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), BusinessUtcOffset).UtcDateTime;

    private static string Reference(string prefix, DateTime now) =>
        $"{prefix}-{now:yyMMdd}-{RandomNumberGenerator.GetInt32(1000, 10_000)}";
}
