namespace ConstructionMS.Infrastructure.Services.PurchaseOrders;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.PurchaseOrders;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using ConstructionMS.Infrastructure.Services.Finance;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

/// <summary>Controls PO correction, independent decision and issuance with immutable events.</summary>
public sealed class PurchaseOrderService : IPurchaseOrderService
{
    private static readonly string[] VisibleRoles =
    [
        PurchaseWorkflowAuthorization.ProcurementOfficer,
        PurchaseWorkflowAuthorization.Supervisor,
        PurchaseWorkflowAuthorization.Storekeeper,
        PurchaseWorkflowAuthorization.FinanceOfficer,
        PurchaseWorkflowAuthorization.ChiefExecutive,
        PurchaseWorkflowAuthorization.Auditor
    ];

    private static readonly string[] FilterStatuses = PurchaseOrderWorkflowStates.All.ToArray();
    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _actorRoleResolver;

    public PurchaseOrderService(AppDbContext db, IActorRoleResolver actorRoleResolver)
    {
        _db = db;
        _actorRoleResolver = actorRoleResolver;
    }

    private IQueryable<PurchaseOrder> BaseQuery() =>
        _db.PurchaseOrders
            .Include(order => order.Project)
            .Include(order => order.Supplier)
            .Include(order => order.CreatedByUser)
            .Include(order => order.ApprovedByUser)
            .Include(order => order.IssuedByUser)
            .Include(order => order.RejectedByUser)
            .Include(order => order.CancelledByUser)
            .Include(order => order.Lines)
                .ThenInclude(line => line.Material)
            .Include(order => order.Events)
                .ThenInclude(workflowEvent => workflowEvent.ActorUser)
            .AsSplitQuery()
            .AsNoTracking();

    public async Task<PaginatedResult<PurchaseOrderResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        int actorUserId,
        string actorRole,
        int? projectId = null,
        string? status = null)
    {
        var actor = await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, VisibleRoles);
        if (projectId is <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(projectId), "The project ID must be greater than zero.");
        }

        var pagination = Pagination.Normalize(page, pageSize);
        var normalizedStatus = NormalizeStatus(status);
        var query = ApplyReadScope(BaseQuery(), actorUserId, actorRole, actor.CanSwitchRoles);
        if (projectId.HasValue)
        {
            query = query.Where(order => order.ProjectId == projectId.Value);
        }

        if (normalizedStatus is not null)
        {
            query = query.Where(order => order.Status == normalizedStatus);
        }

        var totalCount = await query.CountAsync();
        var orders = await query
            .OrderByDescending(order => order.CreatedAt)
            .ThenByDescending(order => order.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();
        return new PaginatedResult<PurchaseOrderResponseDto>
        {
            Items = orders.Select(order => ToDto(order, actorRole)).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<PurchaseOrderResponseDto?> GetByIdAsync(
        int id,
        int actorUserId,
        string actorRole)
    {
        var actor = await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, VisibleRoles);
        var order = await ApplyReadScope(BaseQuery(), actorUserId, actorRole, actor.CanSwitchRoles)
            .FirstOrDefaultAsync(item => item.Id == id);
        return order is null
            ? null
            : ToDto(order, actorRole);
    }

    public async Task<PurchaseOrderResponseDto> CreateAsync(
        CreatePurchaseOrderRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        InputNormalizer.Positive(dto.RequisitionId, nameof(dto.RequisitionId));
        InputNormalizer.Positive(dto.SupplierQuoteId, nameof(dto.SupplierQuoteId));
        var deliveryDate = RequireCurrentOrFutureDate(dto.ExpectedDeliveryDate);

        var quote = await _db.SupplierQuotes
            .Include(item => item.Supplier)
            .Include(item => item.SourcingRound)
                .ThenInclude(round => round.Requisition)
                    .ThenInclude(requisition => requisition.Project)
            .Include(item => item.SourcingRound)
                .ThenInclude(round => round.Requisition)
                    .ThenInclude(requisition => requisition.Material)
            .FirstOrDefaultAsync(item => item.Id == dto.SupplierQuoteId)
            ?? throw new KeyNotFoundException($"Supplier quote with ID {dto.SupplierQuoteId} was not found.");

        var requisition = quote.SourcingRound.Requisition;
        ValidateQuoteForRequisition(quote, requisition, dto.RequisitionId);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, requisition.ProjectId);
        await PurchaseWorkflowAuthorization.RequireOperationalProjectAsync(_db, requisition.ProjectId);

        var now = DateTime.UtcNow;
        var notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);
        var order = new PurchaseOrder
        {
            PurchaseOrderNumber = GeneratePurchaseOrderNumber(now),
            ProjectId = requisition.ProjectId,
            RequisitionId = requisition.Id,
            SupplierId = quote.SupplierId,
            SupplierQuoteId = quote.Id,
            CreatedByUserId = actorUserId,
            Status = PurchaseOrderWorkflowStates.Draft,
            ExpectedDeliveryDate = deliveryDate,
            DeliveryLocation = InputNormalizer.OptionalText(
                dto.DeliveryLocation, nameof(dto.DeliveryLocation), 300)
                ?? requisition.Project.Location,
            Notes = notes,
            CreatedAt = now,
            Lines =
            [
                new PurchaseOrderLine
                {
                    RequisitionId = requisition.Id,
                    MaterialId = requisition.MaterialId,
                    Quantity = requisition.Quantity,
                    UnitPrice = quote.UnitPrice,
                    RequiresTechnicalAcceptance = requisition.Material.RequiresTechnicalAcceptance
                }
            ],
            Events =
            [
                NewEvent(
                    actorUserId,
                    actorRole,
                    "Created",
                    null,
                    PurchaseOrderWorkflowStates.Draft,
                    notes,
                    now)
            ]
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await LockSourcingRoundAsync(quote.SourcingRoundId);
        var currentRoundStatus = await _db.SourcingRounds
            .AsNoTracking()
            .Where(round => round.Id == quote.SourcingRoundId)
            .Select(round => round.Status)
            .SingleAsync();
        if (currentRoundStatus != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("The selected sourcing round is no longer open.");
        }

        if (await HasLivePurchaseOrderAsync(requisition.Id))
        {
            throw new InvalidOperationException("A live purchase order already exists for this requisition.");
        }

        _db.PurchaseOrders.Add(order);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    public async Task<PurchaseOrderResponseDto> SubmitAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        var order = await GetWorkflowOrderAsync(id);
        await RequireCreatorAndAssignmentAsync(order, actorUserId, actorRole);

        // New flow: submitting is approving. Procurement awards the sourcing round and commits the budget itself.
        if (order.Status != PurchaseOrderWorkflowStates.Draft)
        {
            throw InvalidState(order, PurchaseOrderWorkflowStates.Draft, "submitted and approved");
        }
        if (order.SupplierQuote.SourcingRound.Status != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("The source round must be open before this PO can be submitted.");
        }

        EnsureSupplierCanProceed(order);
        var now = DateTime.UtcNow;
        var notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await BudgetCommitmentGuard.LockProjectAsync(_db, order.ProjectId);
        await LockSourcingRoundAsync(order.SupplierQuote.SourcingRoundId);

        var costCodeId = await _db.Requisitions
            .AsNoTracking()
            .Where(item => item.Id == order.RequisitionId)
            .Select(item => item.CostCodeId)
            .SingleAsync();
        await BudgetCommitmentGuard.EnsureAvailableAsync(
            _db,
            order.ProjectId,
            costCodeId,
            order.Lines.Sum(line => line.Quantity * line.UnitPrice),
            excludedPurchaseOrderId: order.Id);

        var roundUpdated = await _db.SourcingRounds
            .Where(round =>
                round.Id == order.SupplierQuote.SourcingRoundId
                && round.Status == SourcingRoundWorkflowStates.Open)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(round => round.Status, SourcingRoundWorkflowStates.Awarded)
                .SetProperty(round => round.ClosedAt, now));
        EnsureTransitionWon(roundUpdated, "The source round was actioned by another user.");

        var orderUpdated = await _db.PurchaseOrders
            .Where(item => item.Id == order.Id && item.Status == PurchaseOrderWorkflowStates.Draft)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, PurchaseOrderWorkflowStates.Approved)
                .SetProperty(item => item.SubmittedAt, now)
                .SetProperty(item => item.ApprovedByUserId, (int?)actorUserId)
                .SetProperty(item => item.ApprovedAt, now));
        EnsureTransitionWon(orderUpdated, "The purchase order was actioned by another user.");

        _db.PurchaseOrderEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            "Approved",
            PurchaseOrderWorkflowStates.Draft,
            PurchaseOrderWorkflowStates.Approved,
            notes,
            now,
            order.Id));
        _db.SourcingRoundEvents.Add(NewSourcingEvent(
            order.SupplierQuote.SourcingRoundId,
            actorUserId,
            actorRole,
            "Awarded",
            SourcingRoundWorkflowStates.Open,
            SourcingRoundWorkflowStates.Awarded,
            $"Awarded through {order.PurchaseOrderNumber}.",
            now));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    /// <summary>Legacy approval for orders submitted under the old two-step flow; new submissions approve directly.</summary>
    public async Task<PurchaseOrderResponseDto> ApproveAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await ValidateIndependentDecisionActorAsync(actorUserId, actorRole);
        var order = await GetWorkflowOrderAsync(id);
        await RequireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole);
        if (order.Status != PurchaseOrderWorkflowStates.Submitted)
        {
            throw InvalidState(order, PurchaseOrderWorkflowStates.Submitted, "approved");
        }

        if (order.SupplierQuote.SourcingRound.Status != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("The source round is no longer open for an award.");
        }

        EnsureSupplierCanProceed(order);
        var now = DateTime.UtcNow;
        var notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await BudgetCommitmentGuard.LockProjectAsync(_db, order.ProjectId);
        await LockSourcingRoundAsync(order.SupplierQuote.SourcingRoundId);

        var costCodeId = await _db.Requisitions
            .AsNoTracking()
            .Where(item => item.Id == order.RequisitionId)
            .Select(item => item.CostCodeId)
            .SingleAsync();
        await BudgetCommitmentGuard.EnsureAvailableAsync(
            _db,
            order.ProjectId,
            costCodeId,
            order.Lines.Sum(line => line.Quantity * line.UnitPrice),
            excludedPurchaseOrderId: order.Id);

        var roundUpdated = await _db.SourcingRounds
            .Where(round =>
                round.Id == order.SupplierQuote.SourcingRoundId
                && round.Status == SourcingRoundWorkflowStates.Open)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(round => round.Status, SourcingRoundWorkflowStates.Awarded)
                .SetProperty(round => round.ClosedAt, now));
        EnsureTransitionWon(roundUpdated, "The source round was actioned by another user.");

        var orderUpdated = await _db.PurchaseOrders
            .Where(item => item.Id == order.Id && item.Status == PurchaseOrderWorkflowStates.Submitted)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, PurchaseOrderWorkflowStates.Approved)
                .SetProperty(item => item.ApprovedByUserId, (int?)actorUserId)
                .SetProperty(item => item.ApprovedAt, now));
        EnsureTransitionWon(orderUpdated, "The purchase order was actioned by another user.");

        _db.PurchaseOrderEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            "Approved",
            PurchaseOrderWorkflowStates.Submitted,
            PurchaseOrderWorkflowStates.Approved,
            notes,
            now,
            order.Id));
        _db.SourcingRoundEvents.Add(NewSourcingEvent(
            order.SupplierQuote.SourcingRoundId,
            actorUserId,
            actorRole,
            "Awarded",
            SourcingRoundWorkflowStates.Open,
            SourcingRoundWorkflowStates.Awarded,
            $"Awarded through {order.PurchaseOrderNumber}.",
            now));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    public async Task<PurchaseOrderResponseDto> IssueAsync(
        int id,
        PurchaseOrderActionRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        var order = await GetWorkflowOrderAsync(id);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, order.ProjectId);
        await PurchaseWorkflowAuthorization.RequireOperationalProjectAsync(_db, order.ProjectId);
        if (order.SupplierQuote.SourcingRound.Status != SourcingRoundWorkflowStates.Awarded)
        {
            throw new InvalidOperationException("The sourcing round must be awarded before issuance.");
        }

        EnsureSupplierCanProceed(order, allowExpiredQuote: true);
        return await SimpleTransitionAsync(
            order,
            PurchaseOrderWorkflowStates.Approved,
            PurchaseOrderWorkflowStates.Issued,
            "Issued",
            actorUserId,
            actorRole,
            dto.Notes);
    }

    public async Task<PurchaseOrderResponseDto> ReturnToDraftAsync(
        int id,
        WorkflowReasonRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await ValidateIndependentDecisionActorAsync(actorUserId, actorRole);
        var order = await GetWorkflowOrderAsync(id);
        await RequireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole);
        return await SimpleTransitionAsync(
            order,
            PurchaseOrderWorkflowStates.Submitted,
            PurchaseOrderWorkflowStates.Draft,
            "ReturnedToDraft",
            actorUserId,
            actorRole,
            RequireReason(dto.Reason));
    }

    public async Task<PurchaseOrderResponseDto> RejectAsync(
        int id,
        WorkflowReasonRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await ValidateIndependentDecisionActorAsync(actorUserId, actorRole);
        var order = await GetWorkflowOrderAsync(id);
        await RequireDecisionScopeAndSeparationAsync(order, actorUserId, actorRole);
        return await SimpleTransitionAsync(
            order,
            PurchaseOrderWorkflowStates.Submitted,
            PurchaseOrderWorkflowStates.Rejected,
            "Rejected",
            actorUserId,
            actorRole,
            RequireReason(dto.Reason));
    }

    public async Task<PurchaseOrderResponseDto> CorrectAsync(
        int id,
        CorrectPurchaseOrderRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        var order = await GetWorkflowOrderAsync(id);
        await RequireCreatorAndAssignmentAsync(order, actorUserId, actorRole);
        if (order.Status != PurchaseOrderWorkflowStates.Draft)
        {
            throw InvalidState(order, PurchaseOrderWorkflowStates.Draft, "corrected");
        }

        if (order.SupplierQuote.SourcingRound.Status != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("The source round must be open before correction.");
        }

        var deliveryDate = RequireCurrentOrFutureDate(dto.ExpectedDeliveryDate);
        var reason = RequireReason(dto.Reason);
        var newLocation = InputNormalizer.OptionalText(
            dto.DeliveryLocation, nameof(dto.DeliveryLocation), 300) ?? order.Project.Location;
        var newNotes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);
        var now = DateTime.UtcNow;
        var details = JsonSerializer.Serialize(new
        {
            Before = new
            {
                order.ExpectedDeliveryDate,
                order.DeliveryLocation,
                order.Notes
            },
            After = new
            {
                ExpectedDeliveryDate = deliveryDate,
                DeliveryLocation = newLocation,
                Notes = newNotes
            }
        });

        await using var transaction = await _db.Database.BeginTransactionAsync();
        var updated = await _db.PurchaseOrders
            .Where(item => item.Id == order.Id && item.Status == PurchaseOrderWorkflowStates.Draft)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.ExpectedDeliveryDate, deliveryDate)
                .SetProperty(item => item.DeliveryLocation, newLocation)
                .SetProperty(item => item.Notes, newNotes));
        EnsureTransitionWon(updated, "The purchase order was actioned by another user.");
        _db.PurchaseOrderEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            "Corrected",
            PurchaseOrderWorkflowStates.Draft,
            PurchaseOrderWorkflowStates.Draft,
            reason,
            now,
            order.Id,
            details));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    public async Task<PurchaseOrderResponseDto> CancelAsync(
        int id,
        WorkflowReasonRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db,
            _actorRoleResolver,
            actorUserId,
            actorRole,
            PurchaseWorkflowAuthorization.ProcurementOfficer,
            PurchaseWorkflowAuthorization.Supervisor,
            PurchaseWorkflowAuthorization.ChiefExecutive);
        var order = await GetWorkflowOrderAsync(id);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, order.ProjectId);

        var procurementCancellation =
            (order.Status == PurchaseOrderWorkflowStates.Draft
                || order.Status == PurchaseOrderWorkflowStates.Rejected
                // A self-approved order stays cancellable by its creator until it is issued.
                || order.Status == PurchaseOrderWorkflowStates.Approved)
            && PurchaseWorkflowAuthorization.RoleEquals(
                actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
            && order.CreatedByUserId == actorUserId;
        var independentCancellation =
            (order.Status == PurchaseOrderWorkflowStates.Submitted
                || order.Status == PurchaseOrderWorkflowStates.Approved)
            && (PurchaseWorkflowAuthorization.RoleEquals(
                    actorRole, PurchaseWorkflowAuthorization.Supervisor)
                || PurchaseWorkflowAuthorization.RoleEquals(
                    actorRole, PurchaseWorkflowAuthorization.ChiefExecutive))
            && order.CreatedByUserId != actorUserId;
        if (!procurementCancellation && !independentCancellation)
        {
            throw new UnauthorizedAccessException(
                "Procurement may cancel its own Draft/Rejected/Approved PO; a legacy Submitted PO requires Supervisor or CEO cancellation.");
        }

        var reason = RequireReason(dto.Reason);
        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();
        var orderUpdated = await _db.PurchaseOrders
            .Where(item => item.Id == order.Id && item.Status == order.Status)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, PurchaseOrderWorkflowStates.Cancelled)
                .SetProperty(item => item.CancelledByUserId, (int?)actorUserId)
                .SetProperty(item => item.CancelledAt, now));
        EnsureTransitionWon(orderUpdated, "The purchase order was actioned by another user.");

        if (order.Status == PurchaseOrderWorkflowStates.Approved)
        {
            var roundUpdated = await _db.SourcingRounds
                .Where(round =>
                    round.Id == order.SupplierQuote.SourcingRoundId
                    && round.Status == SourcingRoundWorkflowStates.Awarded)
                .ExecuteUpdateAsync(updates => updates
                    .SetProperty(round => round.Status, SourcingRoundWorkflowStates.Cancelled)
                    .SetProperty(round => round.ClosedAt, now));
            EnsureTransitionWon(roundUpdated, "The awarded sourcing round changed concurrently.");
            _db.SourcingRoundEvents.Add(NewSourcingEvent(
                order.SupplierQuote.SourcingRoundId,
                actorUserId,
                actorRole,
                "AwardCancelled",
                SourcingRoundWorkflowStates.Awarded,
                SourcingRoundWorkflowStates.Cancelled,
                $"Award cancelled with {order.PurchaseOrderNumber}: {reason}",
                now));
        }

        _db.PurchaseOrderEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            "Cancelled",
            order.Status,
            PurchaseOrderWorkflowStates.Cancelled,
            reason,
            now,
            order.Id));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    private IQueryable<PurchaseOrder> ApplyReadScope(
        IQueryable<PurchaseOrder> query,
        int actorUserId,
        string actorRole,
        bool canSwitchRoles)
    {
        if (PurchaseWorkflowAuthorization.CanViewAllProjects(actorRole) || canSwitchRoles)
        {
            return query;
        }

        query = query.Where(order => _db.UserProjectAssignments.Any(assignment =>
            assignment.UserId == actorUserId
            && assignment.ProjectId == order.ProjectId
            && assignment.IsActive));

        return PurchaseWorkflowAuthorization.RoleEquals(
            actorRole, PurchaseWorkflowAuthorization.Storekeeper)
            ? query.Where(order => order.Status == PurchaseOrderWorkflowStates.Issued)
            : query;
    }

    private async Task<PurchaseOrder> GetWorkflowOrderAsync(int id) =>
        await _db.PurchaseOrders
            .AsNoTracking()
            .Include(order => order.Project)
            .Include(order => order.Supplier)
            .Include(order => order.SupplierQuote)
                .ThenInclude(quote => quote.SourcingRound)
            .Include(order => order.Lines)
            .FirstOrDefaultAsync(order => order.Id == id)
        ?? throw new KeyNotFoundException($"Purchase order with ID {id} was not found.");

    private async Task RequireCreatorAndAssignmentAsync(
        PurchaseOrder order,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, order.ProjectId);
        if (order.CreatedByUserId != actorUserId)
        {
            throw new UnauthorizedAccessException(
                "Only the procurement officer who prepared this PO may change or submit it.");
        }
    }

    private Task ValidateIndependentDecisionActorAsync(int actorUserId, string actorRole) =>
        PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db,
            _actorRoleResolver,
            actorUserId,
            actorRole,
            PurchaseWorkflowAuthorization.Supervisor,
            PurchaseWorkflowAuthorization.ChiefExecutive);

    private async Task RequireDecisionScopeAndSeparationAsync(
        PurchaseOrder order,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, order.ProjectId);
        if (SegregationOfDutiesChecker.IsSameUser(order.CreatedByUserId, actorUserId))
        {
            throw new InvalidOperationException(
                SegregationOfDutiesChecker.GetViolationMessage("PO creator", "PO decision maker"));
        }
    }

    private async Task<PurchaseOrderResponseDto> SimpleTransitionAsync(
        PurchaseOrder order,
        string expectedStatus,
        string nextStatus,
        string eventType,
        int actorUserId,
        string actorRole,
        string? notes)
    {
        if (order.Status != expectedStatus)
        {
            throw InvalidState(order, expectedStatus, eventType.ToLowerInvariant());
        }

        var occurredAt = DateTime.UtcNow;
        var normalizedNotes = InputNormalizer.OptionalText(notes, nameof(notes), 1_000);
        await using var transaction = await _db.Database.BeginTransactionAsync();
        var query = _db.PurchaseOrders
            .Where(item => item.Id == order.Id && item.Status == expectedStatus);
        int updatedRows;

        if (nextStatus == PurchaseOrderWorkflowStates.Submitted)
        {
            updatedRows = await query.ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, nextStatus)
                .SetProperty(item => item.SubmittedAt, occurredAt));
        }
        else if (nextStatus == PurchaseOrderWorkflowStates.Draft)
        {
            updatedRows = await query.ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, nextStatus)
                .SetProperty(item => item.SubmittedAt, (DateTime?)null));
        }
        else if (nextStatus == PurchaseOrderWorkflowStates.Rejected)
        {
            updatedRows = await query.ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, nextStatus)
                .SetProperty(item => item.RejectedByUserId, (int?)actorUserId)
                .SetProperty(item => item.RejectedAt, occurredAt));
        }
        else if (nextStatus == PurchaseOrderWorkflowStates.Issued)
        {
            updatedRows = await query.ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, nextStatus)
                .SetProperty(item => item.IssuedByUserId, (int?)actorUserId)
                .SetProperty(item => item.IssuedAt, occurredAt));
        }
        else
        {
            throw new InvalidOperationException($"Unsupported PO transition to {nextStatus}.");
        }

        EnsureTransitionWon(updatedRows, "The purchase order was actioned by another user.");
        _db.PurchaseOrderEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            eventType,
            expectedStatus,
            nextStatus,
            normalizedNotes,
            occurredAt,
            order.Id));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleOrderAsync(order.Id, actorUserId, actorRole);
    }

    private static void ValidateQuoteForRequisition(
        SupplierQuote quote,
        Requisition requisition,
        int requestedRequisitionId)
    {
        if (requisition.Id != requestedRequisitionId)
        {
            throw new ArgumentException(
                "The supplier quote does not belong to the selected requisition.",
                nameof(requestedRequisitionId));
        }

        if (requisition.Status != RequisitionWorkflowStates.Approved)
        {
            throw new InvalidOperationException("A PO can only be created from an approved requisition.");
        }

        if (quote.SourcingRound.Status != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("The selected sourcing round is no longer open.");
        }

        ValidateQuoteCommercials(quote, requisition.Quantity);
    }

    private static void ValidateQuoteCommercials(SupplierQuote quote, decimal requiredQuantity)
    {
        if (quote.Supplier.IsBlacklisted)
        {
            throw new InvalidOperationException("A purchase order cannot use a blacklisted supplier.");
        }

        if (quote.ValidUntil.HasValue && quote.ValidUntil.Value < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            throw new InvalidOperationException("The selected supplier quote has expired.");
        }

        if (quote.QuantityOffered < requiredQuantity)
        {
            throw new InvalidOperationException("The selected quote does not cover the requisition quantity.");
        }
    }

    private static void EnsureSupplierCanProceed(PurchaseOrder order, bool allowExpiredQuote = false)
    {
        if (order.Supplier.IsBlacklisted)
        {
            throw new InvalidOperationException("The supplier is blacklisted; this PO cannot proceed.");
        }

        if (!allowExpiredQuote
            && order.SupplierQuote.ValidUntil.HasValue
            && order.SupplierQuote.ValidUntil.Value < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            throw new InvalidOperationException("The selected supplier quote has expired.");
        }
    }

    private Task<bool> HasLivePurchaseOrderAsync(int requisitionId) =>
        _db.PurchaseOrders.AnyAsync(order =>
            order.RequisitionId == requisitionId
            && (order.Status == PurchaseOrderWorkflowStates.Draft
                || order.Status == PurchaseOrderWorkflowStates.Submitted
                || order.Status == PurchaseOrderWorkflowStates.Approved
                || order.Status == PurchaseOrderWorkflowStates.Issued));

    private Task<int> LockSourcingRoundAsync(int id) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"SourcingRounds\" WHERE \"Id\" = {id} FOR UPDATE");

    private async Task<PurchaseOrderResponseDto> RequireVisibleOrderAsync(
        int id,
        int actorUserId,
        string actorRole) =>
        await GetByIdAsync(id, actorUserId, actorRole)
        ?? throw new InvalidOperationException("The purchase order changed but could not be retrieved.");

    private static DateOnly RequireCurrentOrFutureDate(DateOnly? value)
    {
        var result = value
            ?? throw new ArgumentException("An expected delivery date is required.", nameof(value));
        if (result < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            throw new ArgumentException("The expected delivery date cannot be in the past.", nameof(value));
        }

        return result;
    }

    private static string RequireReason(string value) =>
        InputNormalizer.RequiredText(value, nameof(value), minimumLength: 3, maximumLength: 1_000);

    private static InvalidOperationException InvalidState(
        PurchaseOrder order,
        string expectedStatus,
        string action) => new(
        $"Only {expectedStatus} purchase orders can be {action}. Current status: {order.Status}.");

    private static void EnsureTransitionWon(int updatedRows, string message)
    {
        if (updatedRows == 0)
        {
            throw new InvalidOperationException($"{message} Refresh and try again.");
        }
    }

    private static PurchaseOrderEvent NewEvent(
        int actorUserId,
        string actorRole,
        string eventType,
        string? fromStatus,
        string toStatus,
        string? notes,
        DateTime occurredAt,
        int purchaseOrderId = 0,
        string? detailsJson = null) => new()
        {
            PurchaseOrderId = purchaseOrderId,
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            EventType = eventType,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Notes = InputNormalizer.OptionalText(notes, nameof(notes), 1_000),
            DetailsJson = detailsJson,
            OccurredAt = occurredAt
        };

    private static SourcingRoundEvent NewSourcingEvent(
        int sourcingRoundId,
        int actorUserId,
        string actorRole,
        string eventType,
        string fromStatus,
        string toStatus,
        string? notes,
        DateTime occurredAt) => new()
        {
            SourcingRoundId = sourcingRoundId,
            ActorUserId = actorUserId,
            ActorRole = actorRole,
            EventType = eventType,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Notes = InputNormalizer.OptionalText(notes, nameof(notes), 1_000),
            OccurredAt = occurredAt
        };

    private static string GeneratePurchaseOrderNumber(DateTime now) =>
        $"PO-{now:yyyyMMdd}-{Guid.NewGuid():N}"[..20].ToUpperInvariant();

    private static string? NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        return FilterStatuses.FirstOrDefault(allowed =>
                   string.Equals(allowed, status.Trim(), StringComparison.OrdinalIgnoreCase))
               ?? throw new ArgumentException("The purchase-order status filter is invalid.", nameof(status));
    }

    private static PurchaseOrderResponseDto ToDto(PurchaseOrder order, string actorRole)
    {
        var fullEvidence = PurchaseWorkflowAuthorization.CanViewAllProjects(actorRole);
        var storekeeper = PurchaseWorkflowAuthorization.RoleEquals(
            actorRole, PurchaseWorkflowAuthorization.Storekeeper);
        var finance = PurchaseWorkflowAuthorization.RoleEquals(
            actorRole, PurchaseWorkflowAuthorization.FinanceOfficer);
        var procurement = PurchaseWorkflowAuthorization.RoleEquals(
            actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        var supervisor = PurchaseWorkflowAuthorization.RoleEquals(
            actorRole, PurchaseWorkflowAuthorization.Supervisor);
        var showCommercials = !storekeeper;
        var showCreator = fullEvidence || procurement || supervisor || finance;
        var showDecisionActors = fullEvidence || finance;

        return new PurchaseOrderResponseDto
        {
            Id = order.Id,
            PurchaseOrderNumber = order.PurchaseOrderNumber,
            ProjectId = order.ProjectId,
            ProjectName = order.Project?.Name ?? string.Empty,
            RequisitionId = order.RequisitionId,
            SupplierId = order.SupplierId,
            SupplierName = order.Supplier?.Name ?? string.Empty,
            SupplierQuoteId = showCommercials ? order.SupplierQuoteId : null,
            Status = order.Status,
            TotalAmount = showCommercials
            ? order.Lines.Sum(line => line.Quantity * line.UnitPrice)
            : null,
            ExpectedDeliveryDate = order.ExpectedDeliveryDate,
            DeliveryLocation = order.DeliveryLocation,
            Notes = showCommercials ? order.Notes : null,
            CreatedByUserId = showCreator ? order.CreatedByUserId : null,
            CreatedByUserName = showCreator ? order.CreatedByUser?.FullName : null,
            ApprovedByUserId = showDecisionActors ? order.ApprovedByUserId : null,
            ApprovedByUserName = showDecisionActors ? order.ApprovedByUser?.FullName : null,
            IssuedByUserId = showDecisionActors ? order.IssuedByUserId : null,
            IssuedByUserName = showDecisionActors ? order.IssuedByUser?.FullName : null,
            RejectedByUserId = showDecisionActors ? order.RejectedByUserId : null,
            RejectedByUserName = showDecisionActors ? order.RejectedByUser?.FullName : null,
            CancelledByUserId = showDecisionActors ? order.CancelledByUserId : null,
            CancelledByUserName = showDecisionActors ? order.CancelledByUser?.FullName : null,
            CreatedAt = storekeeper ? null : order.CreatedAt,
            SubmittedAt = storekeeper ? null : order.SubmittedAt,
            ApprovedAt = storekeeper ? null : order.ApprovedAt,
            IssuedAt = order.IssuedAt,
            RejectedAt = storekeeper ? null : order.RejectedAt,
            CancelledAt = storekeeper ? null : order.CancelledAt,
            Lines = order.Lines
            .OrderBy(line => line.Id)
            .Select(line => new PurchaseOrderLineResponseDto
            {
                Id = line.Id,
                RequisitionId = line.RequisitionId,
                MaterialId = line.MaterialId,
                MaterialName = line.Material?.Name ?? string.Empty,
                MaterialUnit = line.Material?.Unit ?? string.Empty,
                Quantity = line.Quantity,
                RequiresTechnicalAcceptance = line.RequiresTechnicalAcceptance,
                UnitPrice = showCommercials ? line.UnitPrice : null,
                LineTotal = showCommercials ? line.Quantity * line.UnitPrice : null
            })
            .ToList(),
            Events = fullEvidence
            ? order.Events
                .OrderBy(workflowEvent => workflowEvent.OccurredAt)
                .ThenBy(workflowEvent => workflowEvent.Id)
                .Select(workflowEvent => new PurchaseOrderEventResponseDto
                {
                    Id = workflowEvent.Id,
                    EventType = workflowEvent.EventType,
                    FromStatus = workflowEvent.FromStatus,
                    ToStatus = workflowEvent.ToStatus,
                    ActorUserId = workflowEvent.ActorUserId,
                    ActorUserName = workflowEvent.ActorUser?.FullName ?? string.Empty,
                    ActorRole = workflowEvent.ActorRole,
                    Notes = workflowEvent.Notes,
                    DetailsJson = workflowEvent.DetailsJson,
                    OccurredAt = workflowEvent.OccurredAt
                })
                .ToList()
            : []
        };
    }
}
