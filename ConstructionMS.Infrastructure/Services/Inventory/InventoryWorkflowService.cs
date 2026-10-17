namespace ConstructionMS.Infrastructure.Services.Inventory;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Inventory;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Inventory;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using ConstructionMS.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using System.Data;

public sealed class InventoryWorkflowService : IInventoryWorkflowService
{
    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _roles;
    private readonly ControlEventWriter _events;

    public InventoryWorkflowService(AppDbContext db, IActorRoleResolver roles)
    {
        _db = db;
        _roles = roles;
        _events = new ControlEventWriter(db);
    }

    public async Task<PaginatedResult<GoodsReceiptResponseDto>> GetReceiptsAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Procurement Officer", "Finance Officer", "CEO", "Auditor");
        var query = _db.GoodsReceipts.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await query
            .Include(item => item.PurchaseOrder).ThenInclude(order => order.Requisition)
            .Include(item => item.PurchaseOrder).ThenInclude(order => order.Supplier)
            .Include(item => item.PurchaseOrderLine)
            .Include(item => item.Project).Include(item => item.Material).Include(item => item.ReceivedByUser)
            .Include(item => item.TechnicalAcceptances).ThenInclude(item => item.EngineerUser)
            .OrderByDescending(item => item.ReceivedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<GoodsReceiptResponseDto> ReceiveGoodsAsync(
        ReceiveGoodsRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        var delivered = InputNormalizer.Positive(request.DeliveredQuantity, nameof(request.DeliveredQuantity), 18, 3);
        var accepted = InputNormalizer.NonNegative(request.AcceptedQuantity, nameof(request.AcceptedQuantity), 18, 3);
        if (accepted > delivered) throw new ArgumentException("Accepted quantity cannot exceed delivered quantity.");
        var condition = InputNormalizer.RequiredText(request.Condition, nameof(request.Condition), maximumLength: 30);
        if (condition is not ("Good" or "Damaged" or "Mixed")) throw new ArgumentException("Condition must be Good, Damaged, or Mixed.");
        var deliveryReference = InputNormalizer.RequiredText(
            request.DeliveryNoteReference,
            nameof(request.DeliveryNoteReference),
            maximumLength: 100).ToUpperInvariant();
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        var discrepancy = InputNormalizer.OptionalText(request.DiscrepancyNotes, nameof(request.DiscrepancyNotes), 1_000);
        var rejected = delivered - accepted;
        if (rejected > 0 && discrepancy is null) throw new ArgumentException("Discrepancy notes are required when any delivered quantity is rejected.");

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var order = await _db.PurchaseOrders
            .Include(item => item.Lines).ThenInclude(line => line.Material)
            .Include(item => item.Project).Include(item => item.Requisition).Include(item => item.Supplier)
            .SingleOrDefaultAsync(item => item.Id == request.PurchaseOrderId)
            ?? throw new KeyNotFoundException("The purchase order was not found.");
        if (order.Status != PurchaseOrderWorkflowStates.Issued) throw new InvalidOperationException("Goods can be received only against an issued purchase order.");
        if (order.IssuedByUserId == actorUserId) throw new UnauthorizedAccessException("The person who issued the purchase order cannot independently receive its delivery.");
        await RequireProjectAccessAsync(actorUserId, order.ProjectId);
        var line = PurchaseOrderInvariant.RequireSingleLine(order);
        if (await _db.GoodsReceipts.AnyAsync(item =>
                item.SupplierId == order.SupplierId
                && item.DeliveryNoteReference.ToUpper() == deliveryReference))
            throw new InvalidOperationException("That supplier delivery note is already recorded.");
        // A pending engineering check still reserves the outstanding PO quantity, while a
        // technically rejected receipt releases it so the supplier can deliver a replacement.
        var earlierReceipts = await _db.GoodsReceipts
            .Where(item => item.PurchaseOrderLineId == line.Id && item.AcceptedQuantity > 0)
            .Include(item => item.TechnicalAcceptances)
            .ToListAsync();
        var committedBefore = line.RequiresTechnicalAcceptance
            ? earlierReceipts
                .Where(item => LatestTechnicalAcceptance(item)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
                .Sum(item => item.AcceptedQuantity)
            : earlierReceipts.Sum(item => item.AcceptedQuantity);
        if (committedBefore + accepted > line.Quantity)
            throw new InvalidOperationException("The accepted quantity would exceed the outstanding purchase-order quantity.");

        var now = DateTime.UtcNow;
        var receipt = new GoodsReceipt
        {
            ReceiptNumber = Reference("GRN", now), PurchaseOrderId = order.Id, PurchaseOrderLineId = line.Id,
            SupplierId = order.SupplierId, ProjectId = order.ProjectId, MaterialId = line.MaterialId, DeliveredQuantity = delivered,
            AcceptedQuantity = accepted, RejectedQuantity = rejected, Condition = condition,
            DeliveryNoteReference = deliveryReference, EvidenceReference = evidence,
            DiscrepancyNotes = discrepancy, ReceivedByUserId = actorUserId, ReceivedAt = now
        };
        _db.GoodsReceipts.Add(receipt);
        await _db.SaveChangesAsync();
        if (accepted > 0)
        {
            await ChangeBalanceAsync(order.ProjectId, line.MaterialId, accepted, "Receipt", "GoodsReceipt", receipt.Id, receipt.ReceiptNumber, actorUserId, discrepancy, now);
        }
        await _events.AppendAsync(Chain(order.RequisitionId), order.RequisitionId, order.ProjectId, "GoodsReceipt", receipt.Id,
            receipt.ReceiptNumber, "GoodsReceived", actorUserId, actorRole,
            new { delivered, accepted, rejected, condition, deliveryReference }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        receipt.PurchaseOrder = order;
        receipt.PurchaseOrderLine = line;
        receipt.Project = order.Project;
        receipt.Material = line.Material;
        receipt.ReceivedByUser = await _db.Users.AsNoTracking().SingleAsync(item => item.Id == actorUserId);
        return ToDto(receipt);
    }

    public async Task<PaginatedResult<TechnicalAcceptanceResponseDto>> GetTechnicalAcceptancesAsync(
        int page,
        int pageSize,
        int actorUserId,
        string actorRole,
        int? projectId = null,
        string? status = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Engineer", "Finance Officer", "CEO", "Auditor");
        if (projectId is <= 0) throw new ArgumentException("Project ID must be positive.", nameof(projectId));

        var normalizedStatus = NormalizeTechnicalAcceptanceStatus(status);
        var query = _db.GoodsReceipts.AsNoTracking()
            .Where(item => item.PurchaseOrderLine.RequiresTechnicalAcceptance && item.AcceptedQuantity > 0)
            .Where(item => !_db.StockLedgerEntries.Any(entry =>
                entry.ReferenceType == "GoodsReceipt"
                && entry.ReferenceId == item.Id
                && entry.MovementType == "Receipt"
                && entry.QuantityDelta > 0));
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
        {
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment =>
                assignment.UserId == actorUserId
                && assignment.ProjectId == item.ProjectId
                && assignment.IsActive));
        }
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        query = normalizedStatus switch
        {
            "Pending" => query.Where(item => !item.TechnicalAcceptances.Any()),
            "Accepted" => query.Where(item => item.TechnicalAcceptances
                .OrderByDescending(review => review.ReviewSequence)
                .Select(review => review.Outcome)
                .FirstOrDefault() == TechnicalAcceptanceOutcomes.Accepted),
            "Rejected" => query.Where(item => item.TechnicalAcceptances
                .OrderByDescending(review => review.ReviewSequence)
                .Select(review => review.Outcome)
                .FirstOrDefault() == TechnicalAcceptanceOutcomes.Rejected),
            _ => query
        };

        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await TechnicalAcceptanceQuery(query)
            .OrderBy(item => item.TechnicalAcceptances.Any() ? 1 : 0)
            .ThenByDescending(item => item.ReceivedAt)
            .ThenByDescending(item => item.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();
        return Page(items.Select(ToTechnicalAcceptanceDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<TechnicalAcceptanceResponseDto> RecordTechnicalAcceptanceAsync(
        long receiptId,
        RecordTechnicalAcceptanceRequestDto request,
        int actorUserId,
        string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Engineer");
        if (receiptId <= 0) throw new ArgumentException("Goods receipt ID must be positive.", nameof(receiptId));
        var outcome = NormalizeTechnicalAcceptanceOutcome(request.Outcome);
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockGoodsReceiptAsync(receiptId);
        var receipt = await TechnicalAcceptanceQuery(_db.GoodsReceipts)
            .SingleOrDefaultAsync(item => item.Id == receiptId)
            ?? throw new KeyNotFoundException("The goods receipt was not found.");
        if (!receipt.PurchaseOrderLine.RequiresTechnicalAcceptance)
            throw new InvalidOperationException("This purchase-order line does not require engineering technical acceptance.");
        if (receipt.AcceptedQuantity <= 0)
            throw new InvalidOperationException("A receipt with no quantity accepted into Stores does not require engineering technical acceptance.");
        var latestReview = LatestTechnicalAcceptance(receipt);
        if (latestReview?.Outcome == TechnicalAcceptanceOutcomes.Accepted)
            throw new InvalidOperationException("This goods receipt already has final engineering technical acceptance.");
        if (receipt.ReceivedByUserId == actorUserId)
            throw new UnauthorizedAccessException("The Storekeeper who received the delivery cannot perform its engineering technical acceptance.");
        await RequireProjectAccessAsync(actorUserId, receipt.ProjectId);

        var alreadyPosted = await _db.StockLedgerEntries.AsNoTracking().AnyAsync(item =>
            item.ReferenceType == "GoodsReceipt"
            && item.ReferenceId == receiptId
            && item.MovementType == "Receipt"
            && item.QuantityDelta > 0);
        if (alreadyPosted)
            throw new InvalidOperationException("This delivery was already recorded directly into usable stock by the Storekeeper; engineering technical acceptance is no longer required.");

        if (outcome == TechnicalAcceptanceOutcomes.Accepted)
        {
            var otherReceipts = await _db.GoodsReceipts
                .Where(item => item.PurchaseOrderLineId == receipt.PurchaseOrderLineId
                    && item.Id != receipt.Id
                    && item.AcceptedQuantity > 0)
                .Include(item => item.TechnicalAcceptances)
                .ToListAsync();
            var otherCommitted = otherReceipts
                .Where(item => LatestTechnicalAcceptance(item)?.Outcome != TechnicalAcceptanceOutcomes.Rejected)
                .Sum(item => item.AcceptedQuantity);
            if (otherCommitted + receipt.AcceptedQuantity > receipt.PurchaseOrderLine.Quantity)
                throw new InvalidOperationException(
                    "A replacement delivery already reserves this purchase-order quantity, so this rejected receipt cannot now be accepted.");
        }

        var now = DateTime.UtcNow;
        var acceptance = new GoodsReceiptTechnicalAcceptance
        {
            GoodsReceiptId = receipt.Id,
            ReviewSequence = (latestReview?.ReviewSequence ?? 0) + 1,
            EngineerUserId = actorUserId,
            Outcome = outcome,
            Notes = notes,
            EvidenceReference = evidence,
            ReviewedAt = now
        };
        _db.GoodsReceiptTechnicalAcceptances.Add(acceptance);
        await _db.SaveChangesAsync();
        if (outcome == TechnicalAcceptanceOutcomes.Accepted)
        {
            await ChangeBalanceAsync(
                receipt.ProjectId,
                receipt.MaterialId,
                receipt.AcceptedQuantity,
                "TechnicalAcceptance",
                "GoodsReceipt",
                receipt.Id,
                receipt.ReceiptNumber,
                actorUserId,
                notes,
                now);
        }
        await _events.AppendAsync(
            Chain(receipt.PurchaseOrder.RequisitionId),
            receipt.PurchaseOrder.RequisitionId,
            receipt.ProjectId,
            "GoodsReceiptTechnicalAcceptance",
            acceptance.Id,
            receipt.ReceiptNumber,
            outcome == TechnicalAcceptanceOutcomes.Accepted
                ? "DeliveryTechnicallyAccepted"
                : "DeliveryTechnicallyRejected",
            actorUserId,
            actorRole,
            new
            {
                receiptNumber = receipt.ReceiptNumber,
                materialName = receipt.Material.Name,
                quantity = receipt.AcceptedQuantity,
                reviewSequence = acceptance.ReviewSequence,
                outcome,
                notes,
                evidenceReference = evidence
            },
            now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadTechnicalAcceptanceAsync(receipt.Id);
    }

    public async Task<PaginatedResult<StockBalanceResponseDto>> GetBalancesAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Foreman", "Supervisor", "Engineer", "Finance Officer", "CEO", "Auditor");
        var query = _db.StockBalances.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await query.Include(item => item.Project).Include(item => item.Material)
            .OrderBy(item => item.Project.Name).ThenBy(item => item.Material.Name)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(item => new StockBalanceResponseDto
        {
            Id = item.Id, ProjectId = item.ProjectId, ProjectName = item.Project.Name,
            MaterialId = item.MaterialId, MaterialName = item.Material.Name,
            Category = item.Material.Category ?? "Other", Unit = item.Material.Unit,
            QuantityOnHand = item.QuantityOnHand, ReorderLevel = item.Material.ReorderLevel, UpdatedAt = item.UpdatedAt
        }).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<PaginatedResult<StockLedgerEntryResponseDto>> GetLedgerAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null, int? materialId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "Finance Officer", "CEO", "Auditor");
        var query = _db.StockLedgerEntries.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        if (materialId.HasValue) query = query.Where(item => item.MaterialId == materialId.Value);
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await query.Include(item => item.Project).Include(item => item.Material).Include(item => item.ActorUser)
            .OrderByDescending(item => item.OccurredAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(item => new StockLedgerEntryResponseDto
        {
            Id = item.Id, ProjectId = item.ProjectId, ProjectName = item.Project.Name,
            MaterialId = item.MaterialId, MaterialName = item.Material.Name, Unit = item.Material.Unit,
            MovementType = item.MovementType, QuantityDelta = item.QuantityDelta, BalanceAfter = item.BalanceAfter,
            ReferenceType = item.ReferenceType, ReferenceId = item.ReferenceId,
            ReferenceNumber = item.ReferenceNumber, ActorName = item.ActorUser.FullName, Notes = item.Notes, OccurredAt = item.OccurredAt
        }).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<PaginatedResult<MaterialIssueResponseDto>> GetIssuesAsync(
        int page, int pageSize, int actorUserId, string actorRole, int? projectId = null)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Foreman", "Supervisor", "Engineer", "Finance Officer", "CEO", "Auditor");
        var query = _db.MaterialIssues.AsNoTracking();
        var canVerifyAllProjects = await CanVerifyAllProjectsAsync(actorUserId);
        if (actorRole is not ("CEO" or "Auditor") && !canVerifyAllProjects)
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        if (actorRole == "Foreman" && !canVerifyAllProjects)
            query = query.Where(item => item.IssuedToUserId == actorUserId);
        if (projectId.HasValue) query = query.Where(item => item.ProjectId == projectId.Value);
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await IssueQuery(query).OrderByDescending(item => item.IssuedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<MaterialIssueResponseDto> IssueMaterialAsync(
        IssueMaterialRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        var quantity = InputNormalizer.Positive(request.Quantity, nameof(request.Quantity), 18, 3);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var requisition = await _db.Requisitions.Include(item => item.Project).Include(item => item.Material).Include(item => item.RequestedByUser)
            .SingleOrDefaultAsync(item => item.Id == request.RequisitionId)
            ?? throw new KeyNotFoundException("The requisition was not found.");
        if (requisition.Status != RequisitionWorkflowStates.Approved) throw new InvalidOperationException("Materials can be issued only against an approved requisition.");
        if (requisition.RequestType != RequisitionTypes.SiteUse)
            throw new InvalidOperationException("Bulk store replenishment is received into stock and cannot be issued as one foreman handover.");
        if (requisition.RequestedByUserId == actorUserId) throw new UnauthorizedAccessException("The requester cannot issue their own materials.");
        if (quantity != requisition.Quantity)
            throw new InvalidOperationException("This starter workflow issues the full approved quantity on one voucher; revise the requisition before issue if the required quantity changed.");
        await RequireProjectAccessAsync(actorUserId, requisition.ProjectId);
        if (await _db.MaterialIssues.AnyAsync(item => item.RequisitionId == requisition.Id)) throw new InvalidOperationException("This requisition already has a material issue voucher.");
        var balance = await GetBalanceAsync(requisition.ProjectId, requisition.MaterialId);
        if (balance is null || balance.QuantityOnHand < quantity) throw new InvalidOperationException("The project store does not have enough stock for this issue.");

        var now = DateTime.UtcNow;
        var issue = new MaterialIssue
        {
            IssueNumber = Reference("MIV", now), RequisitionId = requisition.Id, ProjectId = requisition.ProjectId,
            MaterialId = requisition.MaterialId, QuantityIssued = quantity, IssuedByUserId = actorUserId,
            IssuedToUserId = requisition.RequestedByUserId, Status = MaterialIssueStatuses.AwaitingConfirmation,
            Notes = notes, IssuedAt = now
        };
        _db.MaterialIssues.Add(issue);
        await _db.SaveChangesAsync();
        await ChangeBalanceAsync(issue.ProjectId, issue.MaterialId, -quantity, "Issue", "MaterialIssue", issue.Id, issue.IssueNumber, actorUserId, notes, now);
        await _events.AppendAsync(Chain(requisition.Id), requisition.Id, issue.ProjectId, "MaterialIssue", issue.Id,
            issue.IssueNumber, "MaterialIssued", actorUserId, actorRole, new { quantity, issuedToUserId = issue.IssuedToUserId }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadIssueAsync(issue.Id);
    }

    public async Task<MaterialIssueResponseDto> ConfirmIssueAsync(
        long id, ConfirmMaterialIssueRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Foreman");
        var received = InputNormalizer.NonNegative(request.ReceivedQuantity, nameof(request.ReceivedQuantity), 18, 3);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockMaterialIssueAsync(id);
        var issue = await _db.MaterialIssues.Include(item => item.Requisition).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The material issue was not found.");
        if (issue.IssuedToUserId != actorUserId) throw new UnauthorizedAccessException("Only the Foreman named on this issue may confirm it.");
        if (issue.Status != MaterialIssueStatuses.AwaitingConfirmation)
        {
            if (issue.ConfirmedByUserId == actorUserId
                && issue.ConfirmedQuantity == received
                && string.Equals(issue.ConfirmationNotes, notes, StringComparison.Ordinal))
            {
                await transaction.CommitAsync();
                return await LoadIssueAsync(id);
            }

            throw new InvalidOperationException("This issue has already been confirmed with different details.");
        }
        if (received > issue.QuantityIssued) throw new ArgumentException("Received quantity cannot exceed issued quantity.");
        if (received != issue.QuantityIssued && notes is null) throw new ArgumentException("Explain any difference between issued and received quantities.");
        var now = DateTime.UtcNow;
        issue.ConfirmedByUserId = actorUserId;
        issue.ConfirmedQuantity = received;
        issue.ConfirmationNotes = notes;
        issue.ConfirmedAt = now;
        issue.Status = received == issue.QuantityIssued ? MaterialIssueStatuses.Confirmed : MaterialIssueStatuses.Disputed;
        await _events.AppendAsync(Chain(issue.RequisitionId), issue.RequisitionId, issue.ProjectId, "MaterialIssue", issue.Id,
            issue.IssueNumber, issue.Status == MaterialIssueStatuses.Confirmed ? "MaterialReceiptConfirmed" : "MaterialReceiptDisputed",
            actorUserId, actorRole, new { issued = issue.QuantityIssued, received, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadIssueAsync(id);
    }

    public async Task<MaterialIssueResponseDto> RecordUsageAsync(
        long id, RecordMaterialUsageRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Foreman");
        var type = InputNormalizer.RequiredText(request.UsageType, nameof(request.UsageType), maximumLength: 20);
        if (type is not ("Used" or "Wastage")) throw new ArgumentException("Usage type must be Used or Wastage.");
        var quantity = InputNormalizer.Positive(request.Quantity, nameof(request.Quantity), 18, 3);
        var reason = InputNormalizer.RequiredText(request.PurposeOrReason, nameof(request.PurposeOrReason), 3, 500);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        var idempotencyKey = InputNormalizer.RequiredText(request.IdempotencyKey, nameof(request.IdempotencyKey), 8, 100);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockMaterialIssueAsync(id);
        var issue = await _db.MaterialIssues.Include(item => item.Requisition).SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The material issue was not found.");
        if (issue.IssuedToUserId != actorUserId) throw new UnauthorizedAccessException("Only the receiving Foreman may account for these materials.");
        if (issue.Status != MaterialIssueStatuses.Confirmed) throw new InvalidOperationException("Confirm the full material receipt before recording use or wastage.");
        var existing = await _db.MaterialUsageRecords.AsNoTracking().SingleOrDefaultAsync(item =>
            item.MaterialIssueId == id && item.IdempotencyKey == idempotencyKey);
        if (existing is not null)
        {
            if (existing.UsageType != type
                || existing.Quantity != quantity
                || existing.PurposeOrReason != reason
                || existing.EvidenceReference != evidence)
                throw new InvalidOperationException("That idempotency key is already used for different material-use details.");

            await transaction.CommitAsync();
            return await LoadIssueAsync(id);
        }
        if (await _db.MaterialCustodyCloseouts.AnyAsync(item =>
                item.MaterialIssueId == id && item.Status != CustodyCloseoutStatuses.Returned))
            throw new InvalidOperationException("Material use cannot change while this custody record is under review or closed.");
        if (await _db.MaterialReturns.AnyAsync(item =>
                item.MaterialIssueId == id && item.Status == MaterialReturnStatuses.AwaitingReceipt))
            throw new InvalidOperationException("Wait for Stores to decide the pending material return before recording more use.");
        var usedOrWasted = await _db.MaterialUsageRecords
            .Where(item => item.MaterialIssueId == id)
            .SumAsync(item => (decimal?)item.Quantity) ?? 0;
        var returned = await _db.MaterialReturns
            .Where(item => item.MaterialIssueId == id && item.Status == MaterialReturnStatuses.Received)
            .SumAsync(item => item.QuantityAccepted ?? 0);
        var already = usedOrWasted + returned;
        if (already + quantity > issue.ConfirmedQuantity) throw new InvalidOperationException("This entry would account for more than the confirmed quantity.");
        var now = DateTime.UtcNow;
        var record = new MaterialUsageRecord
        {
            MaterialIssueId = id, UsageType = type, Quantity = quantity, PurposeOrReason = reason,
            EvidenceReference = evidence, IdempotencyKey = idempotencyKey,
            RecordedByUserId = actorUserId, RecordedAt = now
        };
        _db.MaterialUsageRecords.Add(record);
        await _db.SaveChangesAsync();
        await _events.AppendAsync(Chain(issue.RequisitionId), issue.RequisitionId, issue.ProjectId, "MaterialUsage", record.Id,
            issue.IssueNumber, type == "Used" ? "MaterialUsed" : "MaterialWastageRecorded", actorUserId, actorRole,
            new { quantity, reason, evidence }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadIssueAsync(id);
    }

    public async Task<PaginatedResult<StockTransferResponseDto>> GetTransfersAsync(int page, int pageSize, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "CEO", "Auditor");
        var query = _db.StockTransfers.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.IsActive && (assignment.ProjectId == item.FromProjectId || assignment.ProjectId == item.ToProjectId)));
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await TransferQuery(query).OrderByDescending(item => item.RequestedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<StockTransferResponseDto> CreateTransferAsync(CreateStockTransferRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        if (request.FromProjectId == request.ToProjectId) throw new ArgumentException("Sending and receiving projects must differ.");
        var quantity = InputNormalizer.Positive(request.Quantity, nameof(request.Quantity), 18, 3);
        var reason = InputNormalizer.RequiredText(request.Reason, nameof(request.Reason), 3, 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await RequireProjectAccessAsync(actorUserId, request.FromProjectId);
        await RequireProjectAccessAsync(actorUserId, request.ToProjectId);
        if (!await _db.Materials.AnyAsync(item => item.Id == request.MaterialId)) throw new KeyNotFoundException("The material was not found.");
        var now = DateTime.UtcNow;
        var transfer = new StockTransfer
        {
            TransferNumber = Reference("TRF", now), FromProjectId = request.FromProjectId, ToProjectId = request.ToProjectId,
            MaterialId = request.MaterialId, Quantity = quantity, Reason = reason, Status = StockTransferStatuses.PendingDispatch,
            RequestedByUserId = actorUserId, RequestedAt = now
        };
        _db.StockTransfers.Add(transfer);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"TRF-{transfer.Id}", null, transfer.FromProjectId, "StockTransfer", transfer.Id,
            transfer.TransferNumber, "TransferRequested", actorUserId, actorRole, new { transfer.ToProjectId, quantity, reason }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadTransferAsync(transfer.Id);
    }

    public async Task<StockTransferResponseDto> DispatchTransferAsync(long id, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockStockTransferAsync(id);
        var transfer = await _db.StockTransfers.SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The stock transfer was not found.");
        if (transfer.Status != StockTransferStatuses.PendingDispatch) throw new InvalidOperationException("Only a pending transfer can be dispatched.");
        if (transfer.RequestedByUserId == actorUserId) throw new UnauthorizedAccessException("The transfer requester cannot dispatch the same transfer.");
        await RequireProjectAccessAsync(actorUserId, transfer.FromProjectId);
        var balance = await GetBalanceAsync(transfer.FromProjectId, transfer.MaterialId);
        if (balance is null || balance.QuantityOnHand < transfer.Quantity) throw new InvalidOperationException("The sending store does not have enough stock.");
        var now = DateTime.UtcNow;
        transfer.Status = StockTransferStatuses.InTransit; transfer.DispatchedByUserId = actorUserId; transfer.DispatchedAt = now;
        await ChangeBalanceAsync(transfer.FromProjectId, transfer.MaterialId, -transfer.Quantity, "TransferOut", "StockTransfer", transfer.Id, transfer.TransferNumber, actorUserId, transfer.Reason, now);
        await _events.AppendAsync($"TRF-{transfer.Id}", null, transfer.FromProjectId, "StockTransfer", transfer.Id,
            transfer.TransferNumber, "TransferDispatched", actorUserId, actorRole, new { transfer.Quantity, transfer.ToProjectId }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadTransferAsync(id);
    }

    public async Task<StockTransferResponseDto> ReceiveTransferAsync(long id, ReceiveStockTransferRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        var quantity = InputNormalizer.NonNegative(request.ReceivedQuantity, nameof(request.ReceivedQuantity), 18, 3);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockStockTransferAsync(id);
        var transfer = await _db.StockTransfers.SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The stock transfer was not found.");
        if (transfer.Status != StockTransferStatuses.InTransit) throw new InvalidOperationException("Only an in-transit transfer can be received.");
        if (transfer.DispatchedByUserId == actorUserId) throw new UnauthorizedAccessException("A different Storekeeper must confirm receipt.");
        if (quantity > transfer.Quantity) throw new ArgumentException("Received quantity cannot exceed dispatched quantity.");
        if (quantity != transfer.Quantity && notes is null) throw new ArgumentException("Explain any transfer variance.");
        await RequireProjectAccessAsync(actorUserId, transfer.ToProjectId);
        var now = DateTime.UtcNow;
        transfer.ReceivedByUserId = actorUserId; transfer.ReceivedQuantity = quantity; transfer.ReceiptNotes = notes; transfer.ReceivedAt = now;
        transfer.Status = quantity == transfer.Quantity ? StockTransferStatuses.Received : StockTransferStatuses.Disputed;
        if (quantity > 0) await ChangeBalanceAsync(transfer.ToProjectId, transfer.MaterialId, quantity, "TransferIn", "StockTransfer", transfer.Id, transfer.TransferNumber, actorUserId, notes, now);
        await _events.AppendAsync($"TRF-{transfer.Id}", null, transfer.ToProjectId, "StockTransfer", transfer.Id,
            transfer.TransferNumber, transfer.Status == StockTransferStatuses.Received ? "TransferReceived" : "TransferDisputed",
            actorUserId, actorRole, new { dispatched = transfer.Quantity, received = quantity, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadTransferAsync(id);
    }

    public async Task<StockTransferResponseDto> ResolveTransferDisputeAsync(
        long id,
        ResolveStockTransferDisputeRequestDto request,
        int actorUserId,
        string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "CEO");
        if (id <= 0) throw new ArgumentException("Transfer ID must be positive.", nameof(id));
        var disposition = InputNormalizer.RequiredText(request.Disposition, nameof(request.Disposition), maximumLength: 30);
        if (disposition is not (StockTransferResolutionDispositions.AcceptedLoss
            or StockTransferResolutionDispositions.RecoveredAtDestination
            or StockTransferResolutionDispositions.ReturnedToSource))
            throw new ArgumentException("Transfer resolution must be accepted loss, recovered at destination, or returned to source.");
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        var evidence = InputNormalizer.OptionalText(request.EvidenceReference, nameof(request.EvidenceReference), 500);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await LockStockTransferAsync(id);
        var transfer = await _db.StockTransfers.SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The stock transfer was not found.");
        if (transfer.Status == StockTransferStatuses.Resolved)
        {
            if (transfer.ResolvedByUserId == actorUserId
                && transfer.ResolutionDisposition == disposition
                && transfer.ResolutionNotes == notes
                && transfer.ResolutionEvidenceReference == evidence)
            {
                await transaction.CommitAsync();
                return await LoadTransferAsync(id);
            }

            throw new InvalidOperationException("This transfer variance is already resolved with different details.");
        }
        if (transfer.Status != StockTransferStatuses.Disputed || !transfer.ReceivedQuantity.HasValue)
            throw new InvalidOperationException("Only a disputed transfer can be resolved.");
        if (actorUserId == transfer.RequestedByUserId
            || actorUserId == transfer.DispatchedByUserId
            || actorUserId == transfer.ReceivedByUserId)
            throw new UnauthorizedAccessException(
                "The transfer requester, dispatcher, or receiver cannot resolve its variance.");

        var now = DateTime.UtcNow;
        var variance = transfer.Quantity - transfer.ReceivedQuantity.Value;
        if (variance <= 0) throw new InvalidOperationException("This transfer has no positive variance to resolve.");
        transfer.Status = StockTransferStatuses.Resolved;
        transfer.ResolvedByUserId = actorUserId;
        transfer.ResolutionDisposition = disposition;
        transfer.ResolutionQuantity = variance;
        transfer.ResolutionNotes = notes;
        transfer.ResolutionEvidenceReference = evidence;
        transfer.ResolvedAt = now;
        if (disposition == StockTransferResolutionDispositions.RecoveredAtDestination)
            await ChangeBalanceAsync(transfer.ToProjectId, transfer.MaterialId, variance, "TransferVarianceRecovered", "StockTransfer", transfer.Id, transfer.TransferNumber, actorUserId, notes, now);
        else if (disposition == StockTransferResolutionDispositions.ReturnedToSource)
            await ChangeBalanceAsync(transfer.FromProjectId, transfer.MaterialId, variance, "TransferVarianceReturned", "StockTransfer", transfer.Id, transfer.TransferNumber, actorUserId, notes, now);
        await _events.AppendAsync(
            $"TRF-{transfer.Id}",
            null,
            transfer.ToProjectId,
            "StockTransfer",
            transfer.Id,
            transfer.TransferNumber,
            "TransferVarianceResolved",
            actorUserId,
            actorRole,
            new
            {
                dispatched = transfer.Quantity,
                received = transfer.ReceivedQuantity.Value,
                variance,
                disposition,
                notes,
                evidenceReference = evidence
            },
            now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadTransferAsync(id);
    }

    public async Task<PaginatedResult<StockCountResponseDto>> GetCountsAsync(int page, int pageSize, int actorUserId, string actorRole)
    {
        await RequireAnyRoleAsync(actorUserId, actorRole, "Storekeeper", "Supervisor", "CEO", "Auditor");
        var query = _db.StockCounts.AsNoTracking();
        if (actorRole is not ("CEO" or "Auditor") && !await CanVerifyAllProjectsAsync(actorUserId))
            query = query.Where(item => _db.UserProjectAssignments.Any(assignment => assignment.UserId == actorUserId && assignment.ProjectId == item.ProjectId && assignment.IsActive));
        var pagination = Pagination.Normalize(page, pageSize);
        var total = await query.CountAsync();
        var items = await CountQuery(query).OrderByDescending(item => item.CountedAt).ThenByDescending(item => item.Id)
            .Skip(pagination.Offset).Take(pagination.PageSize).ToListAsync();
        return Page(items.Select(ToDto).ToList(), total, pagination.Page, pagination.PageSize);
    }

    public async Task<StockCountResponseDto> CreateCountAsync(CreateStockCountRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Storekeeper");
        var counted = InputNormalizer.NonNegative(request.CountedQuantity, nameof(request.CountedQuantity), 18, 3);
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await RequireProjectAccessAsync(actorUserId, request.ProjectId);
        var balance = await _db.StockBalances.SingleOrDefaultAsync(item => item.ProjectId == request.ProjectId && item.MaterialId == request.MaterialId)
            ?? throw new InvalidOperationException("No system stock exists for this project and material yet.");
        if (await _db.StockCounts.AnyAsync(item => item.ProjectId == request.ProjectId && item.MaterialId == request.MaterialId && item.Status == StockCountStatuses.AwaitingReview))
            throw new InvalidOperationException("An earlier count for this stock is still awaiting review.");
        var now = DateTime.UtcNow;
        var count = new StockCount
        {
            CountNumber = Reference("CNT", now), ProjectId = request.ProjectId, MaterialId = request.MaterialId,
            SystemQuantity = balance.QuantityOnHand, CountedQuantity = counted, Variance = counted - balance.QuantityOnHand,
            Notes = notes, Status = StockCountStatuses.AwaitingReview, CountedByUserId = actorUserId, CountedAt = now
        };
        _db.StockCounts.Add(count);
        await _db.SaveChangesAsync();
        await _events.AppendAsync($"CNT-{count.Id}", null, count.ProjectId, "StockCount", count.Id, count.CountNumber,
            "StockCountSubmitted", actorUserId, actorRole, new { count.SystemQuantity, count.CountedQuantity, count.Variance }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCountAsync(count.Id);
    }

    public async Task<StockCountResponseDto> ReviewCountAsync(long id, ReviewStockCountRequestDto request, int actorUserId, string actorRole)
    {
        await RequireRoleAsync(actorUserId, actorRole, "Supervisor");
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var count = await _db.StockCounts.SingleOrDefaultAsync(item => item.Id == id)
            ?? throw new KeyNotFoundException("The stock count was not found.");
        if (count.Status != StockCountStatuses.AwaitingReview) throw new InvalidOperationException("This stock count has already been reviewed.");
        if (count.CountedByUserId == actorUserId) throw new UnauthorizedAccessException("The counter cannot review their own stock count.");
        await RequireProjectAccessAsync(actorUserId, count.ProjectId);
        var balance = await GetBalanceAsync(count.ProjectId, count.MaterialId)
            ?? throw new InvalidOperationException("The stock balance no longer exists.");
        if (balance.QuantityOnHand != count.SystemQuantity) throw new InvalidOperationException("Stock moved after this count. Reject it and perform a fresh count.");
        var now = DateTime.UtcNow;
        if (request.Approve
            && count.Variance > 0
            && await HasOpenTechnicalHoldAsync(count.ProjectId, count.MaterialId))
            throw new InvalidOperationException(
                "A delivery for this material is still waiting for technical acceptance or replacement. It cannot enter usable stock through a count adjustment.");
        count.Status = request.Approve ? StockCountStatuses.Approved : StockCountStatuses.Rejected;
        count.ReviewedByUserId = actorUserId; count.ReviewNotes = notes; count.ReviewedAt = now;
        if (request.Approve && count.Variance != 0)
            await ChangeBalanceAsync(count.ProjectId, count.MaterialId, count.Variance, "CountAdjustment", "StockCount", count.Id, count.CountNumber, actorUserId, notes, now);
        await _events.AppendAsync($"CNT-{count.Id}", null, count.ProjectId, "StockCount", count.Id, count.CountNumber,
            request.Approve ? "StockCountApproved" : "StockCountRejected", actorUserId, actorRole, new { count.Variance, notes }, now);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await LoadCountAsync(id);
    }

    private async Task ChangeBalanceAsync(int projectId, int materialId, decimal delta, string movementType,
        string referenceType, long referenceId, string referenceNumber, int actorUserId, string? notes, DateTime now)
    {
        var balance = await GetBalanceAsync(projectId, materialId);
        if (balance is null)
        {
            if (delta < 0) throw new InvalidOperationException("Stock cannot move below zero.");
            balance = new StockBalance { ProjectId = projectId, MaterialId = materialId, QuantityOnHand = 0, UpdatedAt = now };
            _db.StockBalances.Add(balance);
        }
        var after = balance.QuantityOnHand + delta;
        if (after < 0) throw new InvalidOperationException("Stock cannot move below zero.");
        balance.QuantityOnHand = after; balance.UpdatedAt = now;
        _db.StockLedgerEntries.Add(new StockLedgerEntry
        {
            ProjectId = projectId, MaterialId = materialId, MovementType = movementType, QuantityDelta = delta,
            BalanceAfter = after, ReferenceType = referenceType, ReferenceId = referenceId, ReferenceNumber = referenceNumber,
            ActorUserId = actorUserId, Notes = notes, OccurredAt = now
        });
    }

    private Task<StockBalance?> GetBalanceAsync(int projectId, int materialId) =>
        _db.StockBalances.SingleOrDefaultAsync(item => item.ProjectId == projectId && item.MaterialId == materialId);

    private async Task<bool> HasOpenTechnicalHoldAsync(int projectId, int materialId)
    {
        var lines = await _db.PurchaseOrderLines.AsNoTracking()
            .Where(item => item.RequiresTechnicalAcceptance
                && item.MaterialId == materialId
                && item.PurchaseOrder.ProjectId == projectId)
            .Select(item => new { item.Id, item.Quantity })
            .ToListAsync();
        if (lines.Count == 0) return false;

        var lineIds = lines.Select(item => item.Id).ToList();
        var receipts = await _db.GoodsReceipts.AsNoTracking()
            .Where(item => lineIds.Contains(item.PurchaseOrderLineId) && item.AcceptedQuantity > 0)
            .Include(item => item.TechnicalAcceptances)
            .ToListAsync();

        // Receipts already posted to usable stock by the Storekeeper GRN need no further decision.

        var postedReceiptIds = new HashSet<long>(await _db.StockLedgerEntries.AsNoTracking()
            .Where(item => item.ReferenceType == "GoodsReceipt" && item.MovementType == "Receipt" && item.QuantityDelta > 0)
            .Select(item => item.ReferenceId)
            .ToListAsync());
        foreach (var line in lines)
        {
            var lineReceipts = receipts.Where(item => item.PurchaseOrderLineId == line.Id).ToList();
            var unsettled = lineReceipts.Where(item => !postedReceiptIds.Contains(item.Id)).ToList();
            if (unsettled.Count == 0) continue;
            if (unsettled.Any(item => LatestTechnicalAcceptance(item) is null)) return true;

            var acceptedQuantity = unsettled
                .Where(item => LatestTechnicalAcceptance(item)?.Outcome == TechnicalAcceptanceOutcomes.Accepted)
                .Sum(item => item.AcceptedQuantity);
            if (acceptedQuantity < line.Quantity
                && unsettled.Any(item => LatestTechnicalAcceptance(item)?.Outcome == TechnicalAcceptanceOutcomes.Rejected))
                return true;
        }

        return false;
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
            && !await HasAssignmentQuery(userId, projectId).AnyAsync())
            throw new UnauthorizedAccessException("You are not assigned to this project.");
    }

    private async Task<bool> CanVerifyAllProjectsAsync(int userId) =>
        (await _roles.ResolveAsync(userId))?.CanSwitchRoles == true;

    private IQueryable<UserProjectAssignment> HasAssignmentQuery(int userId, int projectId) =>
        _db.UserProjectAssignments.AsNoTracking().Where(item => item.UserId == userId && item.ProjectId == projectId && item.IsActive);
    private static IQueryable<MaterialIssue> IssueQuery(IQueryable<MaterialIssue> query) => query
        .Include(item => item.Requisition).Include(item => item.Project).Include(item => item.Material)
        .Include(item => item.IssuedByUser).Include(item => item.IssuedToUser).Include(item => item.ConfirmedByUser)
        .Include(item => item.UsageRecords).ThenInclude(record => record.RecordedByUser)
        .Include(item => item.Returns)
        .Include(item => item.MaterialCustodyCloseouts)
        .AsSplitQuery();

    private async Task<MaterialIssueResponseDto> LoadIssueAsync(long id)
    {
        var issue = await IssueQuery(_db.MaterialIssues.AsNoTracking().Where(item => item.Id == id)).SingleAsync();
        return ToDto(issue);
    }

    private static MaterialIssueResponseDto ToDto(MaterialIssue item)
    {
        var usage = item.UsageRecords.OrderBy(record => record.RecordedAt).ToList();
        var used = usage.Where(record => record.UsageType == "Used").Sum(record => record.Quantity);
        var wasted = usage.Where(record => record.UsageType == "Wastage").Sum(record => record.Quantity);
        var returned = item.Returns
            .Where(record => record.Status == MaterialReturnStatuses.Received)
            .Sum(record => record.QuantityAccepted ?? 0);
        var confirmed = item.ConfirmedQuantity ?? 0;
        var closeout = item.MaterialCustodyCloseouts.OrderByDescending(record => record.Revision).FirstOrDefault();
        return new MaterialIssueResponseDto
        {
            Id = item.Id, IssueNumber = item.IssueNumber, RequisitionId = item.RequisitionId,
            ProjectId = item.ProjectId, ProjectName = item.Project.Name, MaterialId = item.MaterialId,
            MaterialName = item.Material.Name, MaterialUnit = item.Material.Unit, RequestedQuantity = item.Requisition.Quantity,
            QuantityIssued = item.QuantityIssued, Status = item.Status, IssuedByName = item.IssuedByUser.FullName,
            IssuedToUserId = item.IssuedToUserId, IssuedToName = item.IssuedToUser.FullName, Notes = item.Notes,
            IssuedAt = item.IssuedAt, ConfirmedQuantity = item.ConfirmedQuantity, ConfirmationNotes = item.ConfirmationNotes,
            ConfirmedAt = item.ConfirmedAt, UsedQuantity = used, WastedQuantity = wasted,
            ReturnedQuantity = returned,
            UnaccountedQuantity = Math.Max(0, confirmed - used - wasted - returned),
            CustodyStatus = closeout?.Status ?? (item.Status == MaterialIssueStatuses.Confirmed ? "Open" : item.Status),
            Usage = usage.Select(record => new MaterialUsageResponseDto
            {
                Id = record.Id, UsageType = record.UsageType, Quantity = record.Quantity,
                PurposeOrReason = record.PurposeOrReason, EvidenceReference = record.EvidenceReference,
                RecordedByName = record.RecordedByUser.FullName, RecordedAt = record.RecordedAt
            }).ToList()
        };
    }

    private static GoodsReceiptResponseDto ToDto(GoodsReceipt item)
    {
        var latestReview = LatestTechnicalAcceptance(item);
        return new GoodsReceiptResponseDto
        {
            Id = item.Id, ReceiptNumber = item.ReceiptNumber, PurchaseOrderId = item.PurchaseOrderId,
            PurchaseOrderNumber = item.PurchaseOrder.PurchaseOrderNumber, SupplierName = item.PurchaseOrder.Supplier.Name,
            RequisitionId = item.PurchaseOrder.RequisitionId,
            ProjectId = item.ProjectId, ProjectName = item.Project.Name, MaterialId = item.MaterialId,
            MaterialName = item.Material.Name, MaterialUnit = item.Material.Unit, OrderedQuantity = item.PurchaseOrderLine.Quantity,
            DeliveredQuantity = item.DeliveredQuantity, AcceptedQuantity = item.AcceptedQuantity, RejectedQuantity = item.RejectedQuantity,
            Condition = item.Condition, DeliveryNoteReference = item.DeliveryNoteReference, EvidenceReference = item.EvidenceReference,
            DiscrepancyNotes = item.DiscrepancyNotes, ReceivedByName = item.ReceivedByUser.FullName, ReceivedAt = item.ReceivedAt,
            RequiresTechnicalAcceptance = item.PurchaseOrderLine.RequiresTechnicalAcceptance,
            TechnicalAcceptanceStatus = !item.PurchaseOrderLine.RequiresTechnicalAcceptance || item.AcceptedQuantity <= 0
                ? "NotRequired"
                : latestReview?.Outcome ?? "Pending",
            TechnicalAcceptanceReviewedByName = latestReview?.EngineerUser.FullName,
            TechnicalAcceptanceReviewedAt = latestReview?.ReviewedAt
        };
    }

    private static IQueryable<GoodsReceipt> TechnicalAcceptanceQuery(IQueryable<GoodsReceipt> query) => query
        .Include(item => item.PurchaseOrder).ThenInclude(order => order.Supplier)
        .Include(item => item.PurchaseOrderLine)
        .Include(item => item.Project)
        .Include(item => item.Material)
        .Include(item => item.ReceivedByUser)
        .Include(item => item.TechnicalAcceptances).ThenInclude(item => item.EngineerUser)
        .AsSplitQuery();

    private async Task<TechnicalAcceptanceResponseDto> LoadTechnicalAcceptanceAsync(long receiptId) =>
        ToTechnicalAcceptanceDto(await TechnicalAcceptanceQuery(_db.GoodsReceipts.AsNoTracking())
            .SingleAsync(item => item.Id == receiptId));

    private static TechnicalAcceptanceResponseDto ToTechnicalAcceptanceDto(GoodsReceipt item)
    {
        var latestReview = LatestTechnicalAcceptance(item);
        return new TechnicalAcceptanceResponseDto
        {
            GoodsReceiptId = item.Id,
            TechnicalAcceptanceId = latestReview?.Id,
            ReceiptNumber = item.ReceiptNumber,
            PurchaseOrderId = item.PurchaseOrderId,
            PurchaseOrderNumber = item.PurchaseOrder.PurchaseOrderNumber,
            RequisitionId = item.PurchaseOrder.RequisitionId,
            ProjectId = item.ProjectId,
            ProjectName = item.Project.Name,
            SupplierName = item.PurchaseOrder.Supplier.Name,
            MaterialId = item.MaterialId,
            MaterialName = item.Material.Name,
            MaterialUnit = item.Material.Unit,
            OrderedQuantity = item.PurchaseOrderLine.Quantity,
            DeliveredQuantity = item.DeliveredQuantity,
            AcceptedQuantity = item.AcceptedQuantity,
            Condition = item.Condition,
            DeliveryNoteReference = item.DeliveryNoteReference,
            ReceiptEvidenceReference = item.EvidenceReference,
            ReceivedByName = item.ReceivedByUser.FullName,
            ReceivedAt = item.ReceivedAt,
            RequiresTechnicalAcceptance = item.PurchaseOrderLine.RequiresTechnicalAcceptance,
            Status = latestReview?.Outcome ?? "Pending",
            Outcome = latestReview?.Outcome,
            ReviewSequence = latestReview?.ReviewSequence,
            ReviewedByUserId = latestReview?.EngineerUserId,
            ReviewedByName = latestReview?.EngineerUser.FullName,
            Notes = latestReview?.Notes,
            ReviewEvidenceReference = latestReview?.EvidenceReference,
            ReviewedAt = latestReview?.ReviewedAt
        };
    }

    private static GoodsReceiptTechnicalAcceptance? LatestTechnicalAcceptance(GoodsReceipt receipt) =>
        receipt.TechnicalAcceptances
            .OrderByDescending(item => item.ReviewSequence)
            .FirstOrDefault();

    private Task<int> LockGoodsReceiptAsync(long receiptId) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"GoodsReceipts\" WHERE \"Id\" = {receiptId} FOR UPDATE");

    private Task<int> LockMaterialIssueAsync(long issueId) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"MaterialIssues\" WHERE \"Id\" = {issueId} FOR UPDATE");

    private Task<int> LockStockTransferAsync(long transferId) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"StockTransfers\" WHERE \"Id\" = {transferId} FOR UPDATE");

    private static string? NormalizeTechnicalAcceptanceStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return null;
        return status.Trim().ToLowerInvariant() switch
        {
            "pending" => "Pending",
            "accepted" => TechnicalAcceptanceOutcomes.Accepted,
            "rejected" => TechnicalAcceptanceOutcomes.Rejected,
            _ => throw new ArgumentException("Technical acceptance status must be Pending, Accepted, or Rejected.", nameof(status))
        };
    }

    private static string NormalizeTechnicalAcceptanceOutcome(string outcome) =>
        InputNormalizer.RequiredText(outcome, nameof(outcome), maximumLength: 20).ToLowerInvariant() switch
        {
            "accepted" => TechnicalAcceptanceOutcomes.Accepted,
            "rejected" => TechnicalAcceptanceOutcomes.Rejected,
            _ => throw new ArgumentException("Technical acceptance outcome must be Accepted or Rejected.", nameof(outcome))
        };

    private static IQueryable<StockTransfer> TransferQuery(IQueryable<StockTransfer> query) => query
        .Include(item => item.FromProject).Include(item => item.ToProject).Include(item => item.Material)
        .Include(item => item.RequestedByUser).Include(item => item.DispatchedByUser).Include(item => item.ReceivedByUser)
        .Include(item => item.ResolvedByUser);
    private async Task<StockTransferResponseDto> LoadTransferAsync(long id) => ToDto(await TransferQuery(_db.StockTransfers.AsNoTracking()).SingleAsync(item => item.Id == id));
    private static StockTransferResponseDto ToDto(StockTransfer item) => new()
    {
        Id = item.Id, TransferNumber = item.TransferNumber, FromProjectId = item.FromProjectId,
        FromProjectName = item.FromProject.Name, ToProjectId = item.ToProjectId, ToProjectName = item.ToProject.Name,
        MaterialId = item.MaterialId, MaterialName = item.Material.Name, MaterialUnit = item.Material.Unit,
        Quantity = item.Quantity, Reason = item.Reason, Status = item.Status, RequestedByName = item.RequestedByUser.FullName,
        RequestedAt = item.RequestedAt, DispatchedByUserId = item.DispatchedByUserId,
        DispatchedByName = item.DispatchedByUser?.FullName, DispatchedAt = item.DispatchedAt,
        ReceivedByName = item.ReceivedByUser?.FullName, ReceivedQuantity = item.ReceivedQuantity,
        ReceiptNotes = item.ReceiptNotes, ReceivedAt = item.ReceivedAt,
        ResolvedByName = item.ResolvedByUser?.FullName, ResolutionNotes = item.ResolutionNotes,
        ResolutionDisposition = item.ResolutionDisposition, ResolutionQuantity = item.ResolutionQuantity,
        ResolutionEvidenceReference = item.ResolutionEvidenceReference, ResolvedAt = item.ResolvedAt
    };

    private static IQueryable<StockCount> CountQuery(IQueryable<StockCount> query) => query
        .Include(item => item.Project).Include(item => item.Material).Include(item => item.CountedByUser).Include(item => item.ReviewedByUser);
    private async Task<StockCountResponseDto> LoadCountAsync(long id) => ToDto(await CountQuery(_db.StockCounts.AsNoTracking()).SingleAsync(item => item.Id == id));
    private static StockCountResponseDto ToDto(StockCount item) => new()
    {
        Id = item.Id, CountNumber = item.CountNumber, ProjectId = item.ProjectId, ProjectName = item.Project.Name,
        MaterialId = item.MaterialId, MaterialName = item.Material.Name, MaterialUnit = item.Material.Unit,
        SystemQuantity = item.SystemQuantity, CountedQuantity = item.CountedQuantity, Variance = item.Variance,
        Notes = item.Notes, Status = item.Status, CountedByName = item.CountedByUser.FullName, CountedAt = item.CountedAt,
        ReviewedByName = item.ReviewedByUser?.FullName, ReviewNotes = item.ReviewNotes, ReviewedAt = item.ReviewedAt
    };

    private static string Reference(string prefix, DateTime now) => $"{prefix}-{now:yyMMdd}-{Guid.NewGuid():N}"[..Math.Min(30, prefix.Length + 1 + 6 + 1 + 32)];
    private static string Chain(int requisitionId) => $"REQ-{requisitionId}";
    private static PaginatedResult<T> Page<T>(IReadOnlyList<T> items, int total, int page, int pageSize) => new()
    { Items = items, TotalCount = total, Page = page, PageSize = pageSize };
}
