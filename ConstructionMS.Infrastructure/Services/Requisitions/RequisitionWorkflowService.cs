namespace ConstructionMS.Infrastructure.Services.Requisitions;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Requisitions.V1;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Requisitions;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/// <summary>
/// Implements the authenticated Foreman -> Supervisor requisition path (the Engineer
/// technical check step is bypassedso requests go straight to the Supervisor decision).
/// Actor IDs are supplied by the API from authentication claims and then verified
/// again against the database role and active project assignment.
/// </summary>
public sealed class RequisitionWorkflowService : IRequisitionWorkflowService
{
    private const string ForemanRole = "Foreman";
    private const string StorekeeperRole = "Storekeeper";
    private const string EngineerRole = "Engineer";
    private const string SupervisorRole = "Supervisor";
    private const string CeoRole = "CEO";
    private const string AuditorRole = "Auditor";

    private static readonly IReadOnlySet<string> ReadRoles = new HashSet<string>(StringComparer.Ordinal)
    {
        CeoRole,
        AuditorRole,
        ForemanRole,
        EngineerRole,
        SupervisorRole,
        "Procurement Officer",
        StorekeeperRole
    };

    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _actorRoleResolver;

    public RequisitionWorkflowService(AppDbContext db, IActorRoleResolver actorRoleResolver)
    {
        _db = db;
        _actorRoleResolver = actorRoleResolver;
    }

    public async Task<OperationResult<PaginatedResult<RequisitionWorkflowResponseDto>>> GetAllAsync(
        int actorUserId,
        int page,
        int pageSize,
        string? status,
        int? projectId,
        CancellationToken cancellationToken = default)
    {
        var actor = await GetActorAsync(actorUserId, cancellationToken);
        if (actor is null)
        {
            return Failure<PaginatedResult<RequisitionWorkflowResponseDto>>(
                OperationErrorKind.Forbidden,
                "The authenticated user is inactive or does not exist.");
        }

        if (!ReadRoles.Contains(actor.Role))
        {
            return Failure<PaginatedResult<RequisitionWorkflowResponseDto>>(
                OperationErrorKind.Forbidden,
                "Your role cannot view material requisitions.");
        }

        var normalizedStatus = NormalizeStatus(status);
        if (status is not null && normalizedStatus is null)
        {
            return Failure<PaginatedResult<RequisitionWorkflowResponseDto>>(
                OperationErrorKind.Validation,
                "The requisition status filter is invalid.");
        }

        if (projectId is <= 0)
        {
            return Failure<PaginatedResult<RequisitionWorkflowResponseDto>>(
                OperationErrorKind.Validation,
                "The project ID must be greater than zero.");
        }

        var pagination = Pagination.Normalize(page, pageSize);
        var query = ApplyReadScope(BaseQuery(), actor);

        if (normalizedStatus is not null)
        {
            query = query.Where(requisition => requisition.Status == normalizedStatus);
        }

        if (projectId.HasValue)
        {
            query = query.Where(requisition => requisition.ProjectId == projectId.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var requisitions = await query
            .OrderByDescending(requisition => requisition.CreatedAt)
            .ThenByDescending(requisition => requisition.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync(cancellationToken);

        var pageResult = new PaginatedResult<RequisitionWorkflowResponseDto>
        {
            Items = requisitions.Select(requisition => ToDto(requisition, actor.Role)).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };

        return OperationResult<PaginatedResult<RequisitionWorkflowResponseDto>>.Success(pageResult);
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> GetByIdAsync(
        int actorUserId,
        int requisitionId,
        CancellationToken cancellationToken = default)
    {
        if (requisitionId <= 0)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The requisition ID must be greater than zero.");
        }

        var actor = await GetActorAsync(actorUserId, cancellationToken);
        if (actor is null || !ReadRoles.Contains(actor.Role))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "Your account cannot view material requisitions.");
        }

        var requisition = await ApplyReadScope(BaseQuery(), actor)
            .FirstOrDefaultAsync(item => item.Id == requisitionId, cancellationToken);

        return requisition is null
            ? Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.NotFound,
                "The requisition was not found in your assigned projects.")
            : OperationResult<RequisitionWorkflowResponseDto>.Success(
                ToDto(requisition, actor.Role));
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> CreateAsync(
        int actorUserId,
        CreateRequisitionV1RequestDto request,
        CancellationToken cancellationToken = default)
    {
        var actorResult = await RequireActorAsync(actorUserId, ForemanRole, cancellationToken);
        if (!actorResult.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(actorResult.ErrorKind, actorResult.Error!);
        }

        var validation = ValidateRequestFields(
            request.ProjectId,
            request.MaterialId,
            request.CostCodeId,
            request.Quantity,
            request.NeededByDate,
            request.Purpose,
            request.Notes);
        if (!validation.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(validation.ErrorKind, validation.Error!);
        }

        if (!await HasProjectAccessAsync(actorUserId, request.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "You are not assigned to the selected project.");
        }

        var projectStatus = await _db.Projects.AsNoTracking()
            .Where(project => project.Id == request.ProjectId)
            .Select(project => project.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (projectStatus is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected project does not exist.");
        }

        if (projectStatus != "Active")
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                $"Material requests cannot be created while the project status is {projectStatus}.");
        }

        if (!await _db.Materials.AsNoTracking()
                .AnyAsync(material => material.Id == request.MaterialId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected material does not exist.");
        }


        if (!await _db.Set<CostCode>().AsNoTracking()
                .AnyAsync(costCode => costCode.Id == request.CostCodeId
                    && costCode.ProjectId == request.ProjectId
                    && costCode.IsActive,
                    cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected cost code is not active for this project.");
        }

        var now = DateTime.UtcNow;
        var purpose = InputNormalizer.RequiredText(request.Purpose, nameof(request.Purpose), 3, 500);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var requisition = new Requisition
        {
            ProjectId = request.ProjectId,
            MaterialId = request.MaterialId,
            CostCodeId = request.CostCodeId,
            Quantity = request.Quantity,
            NeededByDate = request.NeededByDate,
            Purpose = purpose,
            Notes = notes,
            RequestedByUserId = actorUserId,
            Status = RequisitionWorkflowStates.AwaitingSupervisorDecision,
            WorkflowRevision = 1,
            CreatedAt = now,
            UpdatedAt = now
        };

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        _db.Requisitions.Add(requisition);
        await _db.SaveChangesAsync(cancellationToken);

        _db.Set<RequisitionApprovalEvent>().Add(CreateEvent(
            requisition.Id,
            sequenceNumber: 1,
            eventType: "Requested",
            actorResult.Value!,
            fromStatus: null,
            toStatus: RequisitionWorkflowStates.AwaitingSupervisorDecision,
            comments: purpose,
            eventDataJson: SerializeRequisitionSnapshot(
                request.ProjectId,
                request.MaterialId,
                request.CostCodeId,
                request.Quantity,
                request.NeededByDate,
                purpose,
                notes),
            occurredAt: now,
            previousHash: null));

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return await LoadCommandResultAsync(actorResult.Value!, requisition.Id, cancellationToken);
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> CreateStockReplenishmentAsync(
        int actorUserId,
        CreateStockReplenishmentRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var actorResult = await RequireActorAsync(actorUserId, StorekeeperRole, cancellationToken);
        if (!actorResult.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(actorResult.ErrorKind, actorResult.Error!);
        }

        var validation = ValidateRequestFields(
            request.ProjectId,
            request.MaterialId,
            request.CostCodeId,
            request.Quantity,
            request.NeededByDate,
            request.Reason,
            request.Notes);
        if (!validation.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(validation.ErrorKind, validation.Error!);
        }

        if (!await HasProjectAccessAsync(actorUserId, request.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "You are not assigned to the selected project store.");
        }

        if (!await IsProjectOperationalAsync(request.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                "Stock replenishment can be requested only for an active project.");
        }

        if (!await _db.Materials.AsNoTracking()
                .AnyAsync(material => material.Id == request.MaterialId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected material does not exist.");
        }

        if (!await _db.Set<CostCode>().AsNoTracking()
                .AnyAsync(costCode => costCode.Id == request.CostCodeId
                    && costCode.ProjectId == request.ProjectId
                    && costCode.IsActive,
                    cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected cost code is not active for this project.");
        }

        var now = DateTime.UtcNow;
        var reason = InputNormalizer.RequiredText(request.Reason, nameof(request.Reason), 3, 500);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var requisition = new Requisition
        {
            ProjectId = request.ProjectId,
            MaterialId = request.MaterialId,
            CostCodeId = request.CostCodeId,
            RequestType = RequisitionTypes.StockReplenishment,
            Quantity = request.Quantity,
            NeededByDate = request.NeededByDate,
            Purpose = reason,
            Notes = notes,
            RequestedByUserId = actorUserId,
            Status = RequisitionWorkflowStates.AwaitingSupervisorDecision,
            WorkflowRevision = 1,
            CreatedAt = now,
            UpdatedAt = now
        };

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        _db.Requisitions.Add(requisition);
        await _db.SaveChangesAsync(cancellationToken);

        _db.Set<RequisitionApprovalEvent>().Add(CreateEvent(
            requisition.Id,
            sequenceNumber: 1,
            eventType: "StockReplenishmentRequested",
            actorResult.Value!,
            fromStatus: null,
            toStatus: RequisitionWorkflowStates.AwaitingSupervisorDecision,
            comments: reason,
            eventDataJson: SerializeRequisitionSnapshot(
                request.ProjectId,
                request.MaterialId,
                request.CostCodeId,
                request.Quantity,
                request.NeededByDate,
                reason,
                notes,
                RequisitionTypes.StockReplenishment),
            occurredAt: now,
            previousHash: null));

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadCommandResultAsync(actorResult.Value!, requisition.Id, cancellationToken);
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> UpdateAsync(
        int actorUserId,
        int requisitionId,
        UpdateRequisitionV1RequestDto request,
        CancellationToken cancellationToken = default)
    {
        var actorResult = await RequireActorAsync(actorUserId, ForemanRole, cancellationToken);
        if (!actorResult.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(actorResult.ErrorKind, actorResult.Error!);
        }

        var requisition = await FindForCommandAsync(requisitionId, cancellationToken);
        if (requisition is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(OperationErrorKind.NotFound, "The requisition was not found.");
        }

        if (requisition.RequestedByUserId != actorUserId)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "Only the foreman who created this requisition may revise it.");
        }

        if (!await HasProjectAccessAsync(actorUserId, requisition.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "You are no longer assigned to this requisition's project.");
        }

        if (requisition.Status is not RequisitionWorkflowStates.AwaitingTechnicalCheck
            and not RequisitionWorkflowStates.ReturnedForRevision)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                "Only a requisition awaiting technical review or returned for revision may be edited.");
        }

        if (requisition.WorkflowRevision != request.ExpectedRevision)
        {
            return RevisionConflict<RequisitionWorkflowResponseDto>();
        }

        var validation = ValidateRequestFields(
            requisition.ProjectId,
            requisition.MaterialId,
            request.CostCodeId,
            request.Quantity,
            request.NeededByDate,
            request.Purpose,
            request.Notes);
        if (!validation.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(validation.ErrorKind, validation.Error!);
        }


        if (!await IsProjectOperationalAsync(requisition.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                "This requisition cannot be revised while the project is not active.");
        }

        if (!await _db.Set<CostCode>().AsNoTracking()
                .AnyAsync(costCode => costCode.Id == request.CostCodeId
                    && costCode.ProjectId == requisition.ProjectId
                    && costCode.IsActive,
                    cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "The selected cost code is not active for this project.");
        }

        var purpose = InputNormalizer.RequiredText(request.Purpose, nameof(request.Purpose), 3, 500);
        var notes = InputNormalizer.OptionalText(request.Notes, nameof(request.Notes), 1_000);
        var now = DateTime.UtcNow;
        var newRevision = requisition.WorkflowRevision + 1;
        var previousHash = await GetLatestEventHashAsync(requisition.Id, cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        var changedRows = await _db.Requisitions
            .Where(item => item.Id == requisition.Id
                && item.WorkflowRevision == requisition.WorkflowRevision
                && item.Status == requisition.Status)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Quantity, request.Quantity)
                .SetProperty(item => item.CostCodeId, request.CostCodeId)
                .SetProperty(item => item.NeededByDate, request.NeededByDate)
                .SetProperty(item => item.Purpose, purpose)
                .SetProperty(item => item.Notes, notes)
                .SetProperty(item => item.Status, RequisitionWorkflowStates.AwaitingSupervisorDecision)
                .SetProperty(item => item.UpdatedAt, now)
                .SetProperty(item => item.WorkflowRevision, newRevision),
                cancellationToken);

        if (changedRows == 0)
        {
            await transaction.RollbackAsync(cancellationToken);
            return RevisionConflict<RequisitionWorkflowResponseDto>();
        }

        _db.Set<RequisitionApprovalEvent>().Add(CreateEvent(
            requisition.Id,
            newRevision,
            "Revised",
            actorResult.Value!,
            requisition.Status,
            RequisitionWorkflowStates.AwaitingSupervisorDecision,
            notes,
            SerializeRequisitionSnapshot(
                requisition.ProjectId,
                requisition.MaterialId,
                request.CostCodeId,
                request.Quantity,
                request.NeededByDate,
                purpose,
                notes),
            now,
            previousHash));

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadCommandResultAsync(actorResult.Value!, requisition.Id, cancellationToken);
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> RecordTechnicalCheckAsync(
        int actorUserId,
        int requisitionId,
        TechnicalCheckRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var actorResult = await RequireActorAsync(actorUserId, EngineerRole, cancellationToken);
        if (!actorResult.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(actorResult.ErrorKind, actorResult.Error!);
        }

        var outcome = request.Outcome?.Trim();
        if (outcome is not "Verified" and not "RevisionRequired")
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "Technical outcome must be Verified or RevisionRequired.");
        }

        var comments = InputNormalizer.OptionalText(request.Comments, nameof(request.Comments), 1_000);
        if (outcome == "RevisionRequired" && comments is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "Explain what the foreman must revise.");
        }

        var requisition = await FindForCommandAsync(requisitionId, cancellationToken);
        if (requisition is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(OperationErrorKind.NotFound, "The requisition was not found.");
        }

        var accessError = await ValidateActionAccessAsync(
            actorUserId,
            requisition,
            request.ExpectedRevision,
            RequisitionWorkflowStates.AwaitingTechnicalCheck,
            cancellationToken);
        if (accessError is not null)
        {
            return accessError;
        }

        if (requisition.RequestedByUserId == actorUserId)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "The requester cannot perform the technical check.");
        }

        var toStatus = outcome == "Verified"
            ? RequisitionWorkflowStates.AwaitingSupervisorDecision
            : RequisitionWorkflowStates.ReturnedForRevision;
        var now = DateTime.UtcNow;
        var newRevision = requisition.WorkflowRevision + 1;
        var previousHash = await GetLatestEventHashAsync(requisition.Id, cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        var changedRows = await UpdateWorkflowStateAsync(
            requisition,
            toStatus,
            newRevision,
            now,
            approvedByUserId: null,
            approvedAt: null,
            cancellationToken);
        if (changedRows == 0)
        {
            await transaction.RollbackAsync(cancellationToken);
            return RevisionConflict<RequisitionWorkflowResponseDto>();
        }

        _db.Set<EngineerTechnicalCheck>().Add(new EngineerTechnicalCheck
        {
            RequisitionId = requisition.Id,
            EngineerUserId = actorUserId,
            Outcome = outcome,
            Comments = comments,
            CheckedAt = now,
            RequisitionRevision = requisition.WorkflowRevision
        });
        _db.Set<RequisitionApprovalEvent>().Add(CreateEvent(
            requisition.Id,
            newRevision,
            outcome == "Verified" ? "TechnicalCheckVerified" : "TechnicalRevisionRequired",
            actorResult.Value!,
            requisition.Status,
            toStatus,
            comments,
            JsonSerializer.Serialize(new
            {
                outcome,
                comments,
                checkedRevision = requisition.WorkflowRevision
            }),
            now,
            previousHash));

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadCommandResultAsync(actorResult.Value!, requisition.Id, cancellationToken);
    }

    public async Task<OperationResult<RequisitionWorkflowResponseDto>> RecordSupervisorDecisionAsync(
        int actorUserId,
        int requisitionId,
        SupervisorDecisionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var actorResult = await RequireActorAsync(actorUserId, SupervisorRole, cancellationToken);
        if (!actorResult.Succeeded)
        {
            return Failure<RequisitionWorkflowResponseDto>(actorResult.ErrorKind, actorResult.Error!);
        }

        var decision = request.Decision?.Trim();
        if (decision is not "Approve" and not "Reject" and not "ReturnForRevision")
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "Decision must be Approve, Reject, or ReturnForRevision.");
        }

        var comments = InputNormalizer.OptionalText(request.Comments, nameof(request.Comments), 1_000);
        if (decision != "Approve" && comments is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "A reason is required when rejecting or returning a requisition.");
        }

        var requisition = await FindForCommandAsync(requisitionId, cancellationToken);
        if (requisition is null)
        {
            return Failure<RequisitionWorkflowResponseDto>(OperationErrorKind.NotFound, "The requisition was not found.");
        }

        // Legacy SiteUse rows created before the Engineer check was removed may still sit in
        // AwaitingTechnicalCheck; the Supervisor can decide them directly, so accept either status.
        var requiredStatus = requisition.Status == RequisitionWorkflowStates.AwaitingTechnicalCheck
            ? RequisitionWorkflowStates.AwaitingTechnicalCheck
            : RequisitionWorkflowStates.AwaitingSupervisorDecision;
        var accessError = await ValidateActionAccessAsync(
            actorUserId,
            requisition,
            request.ExpectedRevision,
            requiredStatus,
            cancellationToken);
        if (accessError is not null)
        {
            return accessError;
        }

        var isStockReplenishment = requisition.RequestType == RequisitionTypes.StockReplenishment;
        if (isStockReplenishment && decision == "ReturnForRevision")
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Validation,
                "Approve or reject a store replenishment request. A rejected request can be raised again with corrected quantities.");
        }

        if (actorUserId == requisition.RequestedByUserId)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "The requester and the supervisor must be different users.");
        }

        var toStatus = decision switch
        {
            "Approve" => RequisitionWorkflowStates.Approved,
            "Reject" => RequisitionWorkflowStates.Rejected,
            _ => RequisitionWorkflowStates.ReturnedForRevision
        };
        var now = DateTime.UtcNow;
        var newRevision = requisition.WorkflowRevision + 1;
        var previousHash = await GetLatestEventHashAsync(requisition.Id, cancellationToken);
        var finalDecision = decision is "Approve" or "Reject";

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        var changedRows = await UpdateWorkflowStateAsync(
            requisition,
            toStatus,
            newRevision,
            now,
            finalDecision ? actorUserId : null,
            finalDecision ? now : null,
            cancellationToken);
        if (changedRows == 0)
        {
            await transaction.RollbackAsync(cancellationToken);
            return RevisionConflict<RequisitionWorkflowResponseDto>();
        }

        _db.Set<RequisitionApprovalEvent>().Add(CreateEvent(
            requisition.Id,
            newRevision,
            decision == "Approve" ? "SupervisorApproved"
                : decision == "Reject" ? "SupervisorRejected"
                : "SupervisorReturnedForRevision",
            actorResult.Value!,
            requisition.Status,
            toStatus,
            comments,
            JsonSerializer.Serialize(new { decision, comments, requisition.RequestType }),
            now,
            previousHash));

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return await LoadCommandResultAsync(actorResult.Value!, requisition.Id, cancellationToken);
    }

    private IQueryable<Requisition> BaseQuery() =>
        _db.Requisitions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(requisition => requisition.Project)
            .Include(requisition => requisition.Material)
            .Include(requisition => requisition.CostCode)
            .Include(requisition => requisition.RequestedByUser)
            .Include(requisition => requisition.ApprovedByUser)
            .Include(requisition => requisition.TechnicalChecks)
                .ThenInclude(check => check.EngineerUser)
            .Include(requisition => requisition.ApprovalEvents)
                .ThenInclude(workflowEvent => workflowEvent.ActorUser);

    private IQueryable<Requisition> ApplyReadScope(IQueryable<Requisition> query, ActorContext actor)
    {
        if (actor.Role is CeoRole or AuditorRole || actor.CanSwitchRoles)
        {
            return actor.Role == ForemanRole
                ? query.Where(requisition => requisition.RequestedByUserId == actor.UserId)
                : query;
        }

        query = query.Where(requisition => _db.Set<UserProjectAssignment>().Any(assignment =>
            assignment.UserId == actor.UserId
            && assignment.ProjectId == requisition.ProjectId
            && assignment.IsActive));

        if (actor.Role == EngineerRole)
        {
            query = query.Where(requisition => requisition.RequestType == RequisitionTypes.SiteUse);
        }

        return actor.Role == ForemanRole
            ? query.Where(requisition => requisition.RequestedByUserId == actor.UserId)
            : query;
    }

    private async Task<OperationResult<ActorContext>> RequireActorAsync(
        int actorUserId,
        string requiredRole,
        CancellationToken cancellationToken)
    {
        var actor = await GetActorAsync(actorUserId, cancellationToken);
        if (actor is null)
        {
            return Failure<ActorContext>(
                OperationErrorKind.Forbidden,
                "The authenticated user is inactive or does not exist.");
        }

        return actor.Role != requiredRole
            ? Failure<ActorContext>(
                OperationErrorKind.Forbidden,
                $"Only an active {requiredRole} may perform this action.")
            : OperationResult<ActorContext>.Success(actor);
    }

    private async Task<ActorContext?> GetActorAsync(
        int actorUserId,
        CancellationToken cancellationToken)
    {
        var actor = await _actorRoleResolver.ResolveAsync(
            actorUserId,
            cancellationToken: cancellationToken);
        return actor is null
            ? null
            : new ActorContext(actor.UserId, actor.FullName, actor.EffectiveRole, actor.CanSwitchRoles);
    }

    private async Task<bool> HasProjectAccessAsync(
        int actorUserId,
        int projectId,
        CancellationToken cancellationToken)
    {
        var actor = await _actorRoleResolver.ResolveAsync(actorUserId, cancellationToken: cancellationToken);
        if (actor?.CanSwitchRoles == true)
        {
            return true;
        }

        return await _db.Set<UserProjectAssignment>()
            .AsNoTracking()
            .AnyAsync(assignment => assignment.UserId == actorUserId
                && assignment.ProjectId == projectId
                && assignment.IsActive,
                cancellationToken);
    }

    private Task<bool> IsProjectOperationalAsync(
        int projectId,
        CancellationToken cancellationToken) =>
        _db.Projects
            .AsNoTracking()
            .AnyAsync(project => project.Id == projectId && project.Status == "Active", cancellationToken);

    private Task<Requisition?> FindForCommandAsync(int requisitionId, CancellationToken cancellationToken) =>
        _db.Requisitions
            .AsNoTracking()
            .FirstOrDefaultAsync(requisition => requisition.Id == requisitionId, cancellationToken);

    private async Task<OperationResult<RequisitionWorkflowResponseDto>?> ValidateActionAccessAsync(
        int actorUserId,
        Requisition requisition,
        int expectedRevision,
        string requiredStatus,
        CancellationToken cancellationToken)
    {
        if (!await HasProjectAccessAsync(actorUserId, requisition.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Forbidden,
                "You are not assigned to this requisition's project.");
        }


        if (!await IsProjectOperationalAsync(requisition.ProjectId, cancellationToken))
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                "Workflow actions are paused while the project is not active.");
        }

        if (requisition.Status != requiredStatus)
        {
            return Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.Conflict,
                $"This action requires status {requiredStatus}; current status is {requisition.Status}.");
        }

        return requisition.WorkflowRevision != expectedRevision
            ? RevisionConflict<RequisitionWorkflowResponseDto>()
            : null;
    }

    private Task<int> UpdateWorkflowStateAsync(
        Requisition requisition,
        string toStatus,
        int newRevision,
        DateTime updatedAt,
        int? approvedByUserId,
        DateTime? approvedAt,
        CancellationToken cancellationToken) =>
        _db.Requisitions
            .Where(item => item.Id == requisition.Id
                && item.WorkflowRevision == requisition.WorkflowRevision
                && item.Status == requisition.Status)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.Status, toStatus)
                .SetProperty(item => item.WorkflowRevision, newRevision)
                .SetProperty(item => item.UpdatedAt, updatedAt)
                .SetProperty(item => item.ApprovedByUserId, approvedByUserId)
                .SetProperty(item => item.ApprovedAt, approvedAt),
                cancellationToken);

    private async Task<OperationResult<RequisitionWorkflowResponseDto>> LoadCommandResultAsync(
        ActorContext actor,
        int requisitionId,
        CancellationToken cancellationToken)
    {
        var requisition = await BaseQuery()
            .FirstOrDefaultAsync(item => item.Id == requisitionId, cancellationToken);

        return requisition is null
            ? Failure<RequisitionWorkflowResponseDto>(
                OperationErrorKind.NotFound,
                "The saved requisition could not be reloaded.")
            : OperationResult<RequisitionWorkflowResponseDto>.Success(
                ToDto(requisition, actor.Role));
    }

    private async Task<string?> GetLatestEventHashAsync(
        int requisitionId,
        CancellationToken cancellationToken) =>
        await _db.Set<RequisitionApprovalEvent>()
            .AsNoTracking()
            .Where(workflowEvent => workflowEvent.RequisitionId == requisitionId)
            .OrderByDescending(workflowEvent => workflowEvent.SequenceNumber)
            .Select(workflowEvent => workflowEvent.EventHash)
            .FirstOrDefaultAsync(cancellationToken);

    private static RequisitionApprovalEvent CreateEvent(
        int requisitionId,
        int sequenceNumber,
        string eventType,
        ActorContext actor,
        string? fromStatus,
        string toStatus,
        string? comments,
        string eventDataJson,
        DateTime occurredAt,
        string? previousHash)
    {
        var canonical = string.Join('\u001f',
            requisitionId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            sequenceNumber.ToString(System.Globalization.CultureInfo.InvariantCulture),
            eventType,
            actor.UserId.ToString(System.Globalization.CultureInfo.InvariantCulture),
            actor.Role,
            fromStatus ?? string.Empty,
            toStatus,
            occurredAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture),
            comments ?? string.Empty,
            eventDataJson,
            previousHash ?? string.Empty);
        var eventHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));

        return new RequisitionApprovalEvent
        {
            RequisitionId = requisitionId,
            SequenceNumber = sequenceNumber,
            EventType = eventType,
            ActorUserId = actor.UserId,
            ActorRole = actor.Role,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Comments = comments,
            EventDataJson = eventDataJson,
            OccurredAt = occurredAt,
            PreviousEventHash = previousHash,
            EventHash = eventHash
        };
    }

    private static string SerializeRequisitionSnapshot(
        int projectId,
        int materialId,
        int costCodeId,
        decimal quantity,
        DateOnly neededByDate,
        string purpose,
        string? notes,
        string requestType = RequisitionTypes.SiteUse) =>
        JsonSerializer.Serialize(new
        {
            projectId,
            materialId,
            costCodeId,
            quantity,
            neededByDate,
            purpose,
            notes,
            requestType
        });

    private static OperationResult<bool> ValidateRequestFields(
        int projectId,
        int materialId,
        int costCodeId,
        decimal quantity,
        DateOnly neededByDate,
        string? purpose,
        string? notes)
    {
        try
        {
            InputNormalizer.Positive(projectId, nameof(projectId));
            InputNormalizer.Positive(materialId, nameof(materialId));
            InputNormalizer.Positive(costCodeId, nameof(costCodeId));
            InputNormalizer.Positive(quantity, nameof(quantity), 18, 3);
            InputNormalizer.RequiredText(purpose, nameof(purpose), 3, 500);
            InputNormalizer.OptionalText(notes, nameof(notes), 1_000);
        }
        catch (ArgumentException exception)
        {
            return Failure<bool>(OperationErrorKind.Validation, exception.Message);
        }

        if (neededByDate == default)
        {
            return Failure<bool>(OperationErrorKind.Validation, "A needed-by date is required.");
        }

        if (neededByDate < DateOnly.FromDateTime(DateTime.UtcNow))
        {
            return Failure<bool>(OperationErrorKind.Validation, "The needed-by date cannot be in the past.");
        }

        return OperationResult<bool>.Success(true);
    }

    private static string? NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        var candidate = status.Trim();
        return RequisitionWorkflowStates.All.FirstOrDefault(allowed =>
            string.Equals(allowed, candidate, StringComparison.OrdinalIgnoreCase));
    }

    private static bool CanReadFullHistory(string role) => role is CeoRole or AuditorRole;

    private static RequisitionWorkflowResponseDto ToDto(Requisition requisition, string actorRole)
    {
        var latestCheck = requisition.TechnicalChecks
            .OrderByDescending(check => check.Id)
            .FirstOrDefault();
        var latestEvent = requisition.ApprovalEvents
            .OrderByDescending(workflowEvent => workflowEvent.SequenceNumber)
            .FirstOrDefault();
        var includeHistory = CanReadFullHistory(actorRole);
        var includeRequester = includeHistory || actorRole is ForemanRole or EngineerRole or SupervisorRole;
        var includeTechnicalDetails = includeHistory
            || actorRole is ForemanRole or EngineerRole or SupervisorRole;
        var includeTechnicalIdentity = includeHistory || actorRole is EngineerRole or SupervisorRole;

        return new RequisitionWorkflowResponseDto
        {
            Id = requisition.Id,
            ProjectId = requisition.ProjectId,
            ProjectName = requisition.Project?.Name ?? string.Empty,
            MaterialId = requisition.MaterialId,
            MaterialName = requisition.Material?.Name ?? string.Empty,
            MaterialUnit = requisition.Material?.Unit ?? string.Empty,
            CostCodeId = requisition.CostCodeId,
            CostCode = requisition.CostCode?.Code ?? string.Empty,
            CostCodeName = requisition.CostCode?.Name ?? string.Empty,
            RequestType = requisition.RequestType,
            Quantity = requisition.Quantity,
            NeededByDate = requisition.NeededByDate,
            Purpose = requisition.Purpose,
            Notes = requisition.Notes,
            Status = requisition.Status,
            WorkflowRevision = requisition.WorkflowRevision,
            RequestedByUserId = includeRequester ? requisition.RequestedByUserId : null,
            RequestedByUserName = includeRequester ? requisition.RequestedByUser?.FullName : null,
            CreatedAt = requisition.CreatedAt,
            UpdatedAt = requisition.UpdatedAt,
            ApprovedAt = requisition.ApprovedAt,
            LatestTechnicalCheck = latestCheck is null
                ? null
                : new TechnicalCheckResponseDto
                {
                    Id = latestCheck.Id,
                    Outcome = latestCheck.Outcome,
                    Comments = includeTechnicalDetails ? latestCheck.Comments : null,
                    EngineerUserId = includeTechnicalIdentity ? latestCheck.EngineerUserId : null,
                    EngineerName = includeTechnicalIdentity ? latestCheck.EngineerUser?.FullName : null,
                    CheckedAt = latestCheck.CheckedAt,
                    RequisitionRevision = latestCheck.RequisitionRevision
                },
            DecidedByUserId = includeHistory ? requisition.ApprovedByUserId : null,
            DecidedByUserName = includeHistory ? requisition.ApprovedByUser?.FullName : null,
            CurrentActionMessage = string.Empty,
            History = includeHistory
                ? requisition.ApprovalEvents
                    .OrderBy(workflowEvent => workflowEvent.SequenceNumber)
                    .Select(workflowEvent => new RequisitionWorkflowEventResponseDto
                    {
                        SequenceNumber = workflowEvent.SequenceNumber,
                        EventType = workflowEvent.EventType,
                        ActorName = workflowEvent.ActorUser?.FullName ?? string.Empty,
                        ActorRole = workflowEvent.ActorRole,
                        FromStatus = workflowEvent.FromStatus,
                        ToStatus = workflowEvent.ToStatus,
                        Comments = workflowEvent.Comments,
                        EventDataJson = workflowEvent.EventDataJson,
                        OccurredAt = workflowEvent.OccurredAt,
                        EventHash = workflowEvent.EventHash
                    })
                    .ToList()
                : []
        };
    }

    private static OperationResult<T> Failure<T>(OperationErrorKind kind, string error) =>
        OperationResult<T>.Failure(kind, error);

    private static OperationResult<T> RevisionConflict<T>() =>
        Failure<T>(
            OperationErrorKind.Conflict,
            "This requisition changed after you opened it. Refresh before trying again.");

    private sealed record ActorContext(int UserId, string Name, string Role, bool CanSwitchRoles);
}
