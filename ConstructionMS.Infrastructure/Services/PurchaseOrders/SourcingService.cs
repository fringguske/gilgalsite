namespace ConstructionMS.Infrastructure.Services.PurchaseOrders;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.PurchaseOrders;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.PurchaseOrders;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

/// <summary>Records comparable supplier quotes and preserves every sourcing decision.</summary>
public sealed class SourcingService : ISourcingService
{
    private static readonly string[] VisibleRoles =
    [
        PurchaseWorkflowAuthorization.ProcurementOfficer,
        PurchaseWorkflowAuthorization.Supervisor,
        PurchaseWorkflowAuthorization.ChiefExecutive,
        PurchaseWorkflowAuthorization.Auditor
    ];

    private static readonly string[] FilterStatuses = SourcingRoundWorkflowStates.All.ToArray();
    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _actorRoleResolver;

    public SourcingService(AppDbContext db, IActorRoleResolver actorRoleResolver)
    {
        _db = db;
        _actorRoleResolver = actorRoleResolver;
    }

    private IQueryable<SourcingRound> BaseQuery() =>
        _db.SourcingRounds
            .Include(round => round.Requisition)
                .ThenInclude(requisition => requisition.Project)
            .Include(round => round.Requisition)
                .ThenInclude(requisition => requisition.Material)
            .Include(round => round.CreatedByUser)
            .Include(round => round.Quotes)
                .ThenInclude(quote => quote.Supplier)
            .Include(round => round.Quotes)
                .ThenInclude(quote => quote.RecordedByUser)
            .Include(round => round.Events)
                .ThenInclude(workflowEvent => workflowEvent.ActorUser)
            .AsSplitQuery()
            .AsNoTracking();

    public async Task<PaginatedResult<SourcingRoundResponseDto>> GetAllAsync(
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
            query = query.Where(round => round.Requisition.ProjectId == projectId.Value);
        }

        if (normalizedStatus is not null)
        {
            query = query.Where(round => round.Status == normalizedStatus);
        }

        var totalCount = await query.CountAsync();
        var rounds = await query
            .OrderByDescending(round => round.CreatedAt)
            .ThenByDescending(round => round.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();
        var includeEvents = PurchaseWorkflowAuthorization.CanViewAllProjects(actorRole);

        return new PaginatedResult<SourcingRoundResponseDto>
        {
            Items = rounds.Select(round => ToDto(round, includeEvents)).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<SourcingRoundResponseDto?> GetByIdAsync(
        int id,
        int actorUserId,
        string actorRole)
    {
        var actor = await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, VisibleRoles);

        var round = await ApplyReadScope(BaseQuery(), actorUserId, actorRole, actor.CanSwitchRoles)
            .FirstOrDefaultAsync(item => item.Id == id);
        return round is null
            ? null
            : ToDto(round, PurchaseWorkflowAuthorization.CanViewAllProjects(actorRole));
    }

    public async Task<SourcingRoundResponseDto> CreateAsync(
        CreateSourcingRoundRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        InputNormalizer.Positive(dto.RequisitionId, nameof(dto.RequisitionId));
        ValidateFutureDeadline(dto.QuoteDueAt);

        var requisition = await _db.Requisitions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == dto.RequisitionId)
            ?? throw new KeyNotFoundException($"Requisition with ID {dto.RequisitionId} was not found.");

        if (requisition.Status != RequisitionWorkflowStates.Approved)
        {
            throw new InvalidOperationException("Only an approved requisition can enter supplier sourcing.");
        }

        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, requisition.ProjectId);
        await PurchaseWorkflowAuthorization.RequireOperationalProjectAsync(_db, requisition.ProjectId);

        if (await HasCurrentRoundAsync(requisition.Id))
        {
            throw new InvalidOperationException(
                "This requisition already has an open or awarded sourcing round.");
        }

        var now = DateTime.UtcNow;
        var notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);
        var round = new SourcingRound
        {
            RequisitionId = requisition.Id,
            CreatedByUserId = actorUserId,
            Status = SourcingRoundWorkflowStates.Open,
            QuoteDueAt = dto.QuoteDueAt?.UtcDateTime,
            Notes = notes,
            CreatedAt = now,
            Events =
            [
                NewEvent(
                    actorUserId,
                    actorRole,
                    "Created",
                    null,
                    SourcingRoundWorkflowStates.Open,
                    notes,
                    now)
            ]
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await LockRequisitionAsync(requisition.Id);
        if (await HasCurrentRoundAsync(requisition.Id))
        {
            throw new InvalidOperationException(
                "This requisition already has an open or awarded sourcing round.");
        }

        _db.SourcingRounds.Add(round);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleRoundAsync(round.Id, actorUserId, actorRole);
    }

    public async Task<SupplierQuoteResponseDto> RecordQuoteAsync(
        int sourcingRoundId,
        RecordSupplierQuoteRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        InputNormalizer.Positive(sourcingRoundId, nameof(sourcingRoundId));
        InputNormalizer.Positive(dto.SupplierId, nameof(dto.SupplierId));

        var round = await _db.SourcingRounds
            .Include(item => item.Requisition)
            .FirstOrDefaultAsync(item => item.Id == sourcingRoundId)
            ?? throw new KeyNotFoundException($"Sourcing round with ID {sourcingRoundId} was not found.");

        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, round.Requisition.ProjectId);

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await LockSourcingRoundAsync(round.Id);
        var currentRound = await _db.SourcingRounds
            .AsNoTracking()
            .Where(item => item.Id == round.Id)
            .Select(item => new { item.Status, item.QuoteDueAt })
            .SingleAsync();
        if (currentRound.Status != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("Quotes can only be recorded while the sourcing round is open.");
        }

        if (currentRound.QuoteDueAt.HasValue && currentRound.QuoteDueAt.Value < DateTime.UtcNow)
        {
            throw new InvalidOperationException("The sourcing round's quote deadline has passed.");
        }

        var supplier = await _db.Suppliers
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == dto.SupplierId)
            ?? throw new KeyNotFoundException($"Supplier with ID {dto.SupplierId} was not found.");
        if (supplier.IsBlacklisted)
        {
            throw new InvalidOperationException("A blacklisted supplier cannot participate in sourcing.");
        }

        var standardPriceSnapshot = await _db.Materials
            .AsNoTracking()
            .Where(material => material.Id == round.Requisition.MaterialId)
            .Select(material => material.StandardPrice)
            .SingleAsync();

        var quantity = InputNormalizer.Positive(dto.QuantityOffered, nameof(dto.QuantityOffered), 18, 3);
        if (quantity < round.Requisition.Quantity)
        {
            throw new ArgumentException(
                "The offered quantity cannot be less than the requisition quantity.",
                nameof(dto.QuantityOffered));
        }

        if (dto.ValidUntil.HasValue && dto.ValidUntil.Value < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            throw new ArgumentException("The quote validity date cannot be in the past.", nameof(dto.ValidUntil));
        }

        var reference = InputNormalizer.RequiredText(
            dto.QuoteReference, nameof(dto.QuoteReference), maximumLength: 100);
        if (await _db.SupplierQuotes.AnyAsync(quote =>
            quote.SourcingRoundId == sourcingRoundId
            && (quote.SupplierId == dto.SupplierId || quote.QuoteReference == reference)))
        {
            throw new InvalidOperationException(
                "This supplier or quote reference has already been recorded in the sourcing round.");
        }

        var quote = new SupplierQuote
        {
            SourcingRoundId = sourcingRoundId,
            SupplierId = dto.SupplierId,
            RecordedByUserId = actorUserId,
            QuoteReference = reference,
            QuantityOffered = quantity,
            UnitPrice = InputNormalizer.Positive(dto.UnitPrice, nameof(dto.UnitPrice), 18, 2),
            StandardPriceSnapshot = standardPriceSnapshot,
            ValidUntil = dto.ValidUntil,
            Notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000),
            RecordedAt = DateTime.UtcNow
        };

        _db.SupplierQuotes.Add(quote);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        var actorName = await _db.Users.AsNoTracking()
            .Where(user => user.Id == actorUserId)
            .Select(user => user.FullName)
            .SingleAsync();

        return new SupplierQuoteResponseDto
        {
            Id = quote.Id,
            SourcingRoundId = sourcingRoundId,
            SupplierId = supplier.Id,
            SupplierName = supplier.Name,
            QuoteReference = quote.QuoteReference,
            QuantityOffered = quote.QuantityOffered,
            UnitPrice = quote.UnitPrice,
            StandardPriceSnapshot = quote.StandardPriceSnapshot,
            PriceVariancePercentage = CalculateVariance(
                quote.UnitPrice, quote.StandardPriceSnapshot),
            PriceAboveStandard = quote.StandardPriceSnapshot > 0
                ? quote.UnitPrice > quote.StandardPriceSnapshot
                : null,
            TotalPrice = quote.QuantityOffered * quote.UnitPrice,
            ValidUntil = quote.ValidUntil,
            RecordedByUserId = actorUserId,
            RecordedByUserName = actorName,
            Notes = quote.Notes,
            RecordedAt = quote.RecordedAt
        };
    }

    public async Task<SourcingRoundResponseDto> CloseAsync(
        int id,
        WorkflowReasonRequestDto dto,
        int actorUserId,
        string actorRole)
    {
        await PurchaseWorkflowAuthorization.ValidateActorAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer);
        var round = await GetWorkflowRoundAsync(id);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, round.Requisition.ProjectId);
        return await EndRoundAsync(
            round,
            SourcingRoundWorkflowStates.Closed,
            "Closed",
            RequireReason(dto.Reason),
            actorUserId,
            actorRole);
    }

    public async Task<SourcingRoundResponseDto> CancelAsync(
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
            PurchaseWorkflowAuthorization.Supervisor,
            PurchaseWorkflowAuthorization.ChiefExecutive);
        var round = await GetWorkflowRoundAsync(id);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, round.Requisition.ProjectId);
        return await EndRoundAsync(
            round,
            SourcingRoundWorkflowStates.Cancelled,
            "Cancelled",
            RequireReason(dto.Reason),
            actorUserId,
            actorRole);
    }

    public async Task<SourcingRoundResponseDto> ReopenAsync(
        int id,
        ReopenSourcingRoundRequestDto dto,
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
        ValidateFutureDeadline(dto.QuoteDueAt);
        var round = await GetWorkflowRoundAsync(id);
        await PurchaseWorkflowAuthorization.RequireProjectAssignmentAsync(
            _db, _actorRoleResolver, actorUserId, actorRole, round.Requisition.ProjectId);

        var canReopen = round.Status == SourcingRoundWorkflowStates.Closed
            ? PurchaseWorkflowAuthorization.RoleEquals(
                actorRole, PurchaseWorkflowAuthorization.ProcurementOfficer)
            : round.Status == SourcingRoundWorkflowStates.Cancelled
              && (PurchaseWorkflowAuthorization.RoleEquals(
                      actorRole, PurchaseWorkflowAuthorization.Supervisor)
                  || PurchaseWorkflowAuthorization.RoleEquals(
                      actorRole, PurchaseWorkflowAuthorization.ChiefExecutive));
        if (!canReopen)
        {
            throw new UnauthorizedAccessException(
                "Closed rounds may be reopened by Procurement; cancelled rounds require Supervisor or CEO authority.");
        }

        if (round.Requisition.Status != RequisitionWorkflowStates.Approved)
        {
            throw new InvalidOperationException("The source requisition is no longer approved.");
        }

        await PurchaseWorkflowAuthorization.RequireOperationalProjectAsync(
            _db, round.Requisition.ProjectId);
        var reason = RequireReason(dto.Reason);
        var now = DateTime.UtcNow;
        var reopenedDeadline = dto.QuoteDueAt?.UtcDateTime ?? round.QuoteDueAt;
        if (reopenedDeadline.HasValue && reopenedDeadline.Value <= now)
        {
            throw new ArgumentException(
                "A future quote deadline is required when reopening an expired sourcing round.",
                nameof(dto.QuoteDueAt));
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();
        await LockSourcingRoundAsync(round.Id);
        var currentStatus = await _db.SourcingRounds
            .AsNoTracking()
            .Where(item => item.Id == round.Id)
            .Select(item => item.Status)
            .SingleAsync();
        if (currentStatus != round.Status)
        {
            throw new InvalidOperationException(
                "The sourcing round was actioned by another user. Refresh and try again.");
        }

        if (await HasCurrentRoundAsync(round.RequisitionId, round.Id))
        {
            throw new InvalidOperationException("Another open or awarded round now exists for this requisition.");
        }

        if (await HasLivePurchaseOrderAsync(round.RequisitionId))
        {
            throw new InvalidOperationException("A live purchase order already exists for this requisition.");
        }

        var updated = await _db.SourcingRounds
            .Where(item => item.Id == round.Id && item.Status == round.Status)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, SourcingRoundWorkflowStates.Open)
                .SetProperty(item => item.ClosedAt, (DateTime?)null)
                .SetProperty(item => item.QuoteDueAt, reopenedDeadline));
        EnsureTransitionWon(updated);
        _db.SourcingRoundEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            "Reopened",
            round.Status,
            SourcingRoundWorkflowStates.Open,
            reason,
            now,
            round.Id));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleRoundAsync(round.Id, actorUserId, actorRole);
    }

    private IQueryable<SourcingRound> ApplyReadScope(
        IQueryable<SourcingRound> query,
        int actorUserId,
        string actorRole,
        bool canSwitchRoles)
    {
        if (PurchaseWorkflowAuthorization.CanViewAllProjects(actorRole) || canSwitchRoles)
        {
            return query;
        }

        return query.Where(round => _db.UserProjectAssignments.Any(assignment =>
            assignment.UserId == actorUserId
            && assignment.ProjectId == round.Requisition.ProjectId
            && assignment.IsActive));
    }

    private async Task<SourcingRound> GetWorkflowRoundAsync(int id) =>
        await _db.SourcingRounds
            .AsNoTracking()
            .Include(round => round.Requisition)
            .FirstOrDefaultAsync(round => round.Id == id)
        ?? throw new KeyNotFoundException($"Sourcing round with ID {id} was not found.");

    private async Task<SourcingRoundResponseDto> EndRoundAsync(
        SourcingRound round,
        string nextStatus,
        string eventType,
        string reason,
        int actorUserId,
        string actorRole)
    {
        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await LockSourcingRoundAsync(round.Id);
        var currentStatus = await _db.SourcingRounds
            .AsNoTracking()
            .Where(item => item.Id == round.Id)
            .Select(item => item.Status)
            .SingleAsync();
        if (currentStatus != SourcingRoundWorkflowStates.Open)
        {
            throw new InvalidOperationException("Only an open sourcing round can be closed or cancelled.");
        }

        if (await HasLivePurchaseOrderAsync(round.RequisitionId))
        {
            throw new InvalidOperationException(
                "Cancel or complete the live purchase order before ending this sourcing round.");
        }

        var updated = await _db.SourcingRounds
            .Where(item => item.Id == round.Id && item.Status == SourcingRoundWorkflowStates.Open)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, nextStatus)
                .SetProperty(item => item.ClosedAt, now));
        EnsureTransitionWon(updated);
        _db.SourcingRoundEvents.Add(NewEvent(
            actorUserId,
            actorRole,
            eventType,
            SourcingRoundWorkflowStates.Open,
            nextStatus,
            reason,
            now,
            round.Id));
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await RequireVisibleRoundAsync(round.Id, actorUserId, actorRole);
    }

    private Task<int> LockSourcingRoundAsync(int id) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"SourcingRounds\" WHERE \"Id\" = {id} FOR UPDATE");

    private Task<int> LockRequisitionAsync(int id) =>
        _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"Requisitions\" WHERE \"Id\" = {id} FOR UPDATE");

    private Task<bool> HasCurrentRoundAsync(int requisitionId, int excludedId = 0) =>
        _db.SourcingRounds.AnyAsync(round =>
            round.RequisitionId == requisitionId
            && round.Id != excludedId
            && (round.Status == SourcingRoundWorkflowStates.Open
                || round.Status == SourcingRoundWorkflowStates.Awarded));

    private Task<bool> HasLivePurchaseOrderAsync(int requisitionId) =>
        _db.PurchaseOrders.AnyAsync(order =>
            order.RequisitionId == requisitionId
            && (order.Status == PurchaseOrderWorkflowStates.Draft
                || order.Status == PurchaseOrderWorkflowStates.Submitted
                || order.Status == PurchaseOrderWorkflowStates.Approved
                || order.Status == PurchaseOrderWorkflowStates.Issued));

    private async Task<SourcingRoundResponseDto> RequireVisibleRoundAsync(
        int id,
        int actorUserId,
        string actorRole) =>
        await GetByIdAsync(id, actorUserId, actorRole)
        ?? throw new InvalidOperationException("The sourcing round changed but could not be retrieved.");

    private static void ValidateFutureDeadline(DateTimeOffset? deadline)
    {
        if (deadline.HasValue && deadline.Value <= DateTimeOffset.UtcNow)
        {
            throw new ArgumentException("The quote deadline must be in the future.", nameof(deadline));
        }
    }

    private static string RequireReason(string value) =>
        InputNormalizer.RequiredText(value, nameof(value), minimumLength: 3, maximumLength: 1_000);

    private static void EnsureTransitionWon(int updatedRows)
    {
        if (updatedRows == 0)
        {
            throw new InvalidOperationException(
                "The sourcing round was actioned by another user. Refresh and try again.");
        }
    }

    private static SourcingRoundEvent NewEvent(
        int actorUserId,
        string actorRole,
        string eventType,
        string? fromStatus,
        string toStatus,
        string? notes,
        DateTime occurredAt,
        int sourcingRoundId = 0) => new()
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

    private static string? NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        return FilterStatuses.FirstOrDefault(allowed =>
                   string.Equals(allowed, status.Trim(), StringComparison.OrdinalIgnoreCase))
               ?? throw new ArgumentException("The sourcing-round status filter is invalid.", nameof(status));
    }

    private static SourcingRoundResponseDto ToDto(SourcingRound round, bool includeEvents) => new()
    {
        Id = round.Id,
        RequisitionId = round.RequisitionId,
        ProjectId = round.Requisition.ProjectId,
        ProjectName = round.Requisition.Project?.Name ?? string.Empty,
        MaterialId = round.Requisition.MaterialId,
        MaterialName = round.Requisition.Material?.Name ?? string.Empty,
        MaterialUnit = round.Requisition.Material?.Unit ?? string.Empty,
        RequestedQuantity = round.Requisition.Quantity,
        CreatedByUserId = round.CreatedByUserId,
        CreatedByUserName = round.CreatedByUser?.FullName ?? string.Empty,
        Status = round.Status,
        QuoteDueAt = round.QuoteDueAt,
        Notes = round.Notes,
        CreatedAt = round.CreatedAt,
        ClosedAt = round.ClosedAt,
        Quotes = round.Quotes
            .OrderBy(quote => quote.UnitPrice)
            .ThenBy(quote => quote.Id)
            .Select(quote => new SupplierQuoteResponseDto
            {
                Id = quote.Id,
                SourcingRoundId = quote.SourcingRoundId,
                SupplierId = quote.SupplierId,
                SupplierName = quote.Supplier?.Name ?? string.Empty,
                QuoteReference = quote.QuoteReference,
                QuantityOffered = quote.QuantityOffered,
                UnitPrice = quote.UnitPrice,
                StandardPriceSnapshot = quote.StandardPriceSnapshot,
                PriceVariancePercentage = CalculateVariance(
                    quote.UnitPrice, quote.StandardPriceSnapshot),
                PriceAboveStandard = quote.StandardPriceSnapshot > 0
                    ? quote.UnitPrice > quote.StandardPriceSnapshot
                    : null,
                TotalPrice = quote.QuantityOffered * quote.UnitPrice,
                ValidUntil = quote.ValidUntil,
                RecordedByUserId = quote.RecordedByUserId,
                RecordedByUserName = quote.RecordedByUser?.FullName ?? string.Empty,
                Notes = quote.Notes,
                RecordedAt = quote.RecordedAt
            })
            .ToList(),
        Events = includeEvents
            ? round.Events
                .OrderBy(workflowEvent => workflowEvent.OccurredAt)
                .ThenBy(workflowEvent => workflowEvent.Id)
                .Select(workflowEvent => new SourcingRoundEventResponseDto
                {
                    Id = workflowEvent.Id,
                    EventType = workflowEvent.EventType,
                    FromStatus = workflowEvent.FromStatus,
                    ToStatus = workflowEvent.ToStatus,
                    ActorUserId = workflowEvent.ActorUserId,
                    ActorUserName = workflowEvent.ActorUser?.FullName ?? string.Empty,
                    ActorRole = workflowEvent.ActorRole,
                    Notes = workflowEvent.Notes,
                    OccurredAt = workflowEvent.OccurredAt
                })
                .ToList()
            : []
    };

    private static decimal? CalculateVariance(decimal quotedPrice, decimal standardPrice) =>
        standardPrice <= 0
            ? null
            : Math.Round((quotedPrice - standardPrice) / standardPrice * 100m, 2);
}
