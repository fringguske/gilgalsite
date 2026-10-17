namespace ConstructionMS.Infrastructure.Services.Projects;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Projects;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Projects;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using ConstructionMS.Infrastructure.Services.Finance;
using Microsoft.EntityFrameworkCore;
using System.Data;

/// <summary>
/// Project queries are always scoped to the current actor. Budget revisions and
/// progress verifications are append-only so the executive view is explainable.
/// </summary>
public sealed class ProjectService : IProjectService
{
    private const string CeoRole = "CEO";
    private const string AdministratorRole = "Administrator";
    private const string AuditorRole = "Auditor";
    private const string EngineerRole = "Engineer";

    private static readonly IReadOnlySet<string> FinancialReadRoles = new HashSet<string>(StringComparer.Ordinal)
    {
        CeoRole,
        AuditorRole,
        "Supervisor",
        "Finance Officer"
    };

    private readonly AppDbContext _db;
    private readonly IActorRoleResolver _actorRoleResolver;

    private static readonly string[] AllowedStatuses =
        ["Active", "On Hold", "Completed", "Cancelled"];

    public ProjectService(AppDbContext db, IActorRoleResolver actorRoleResolver)
    {
        _db = db;
        _actorRoleResolver = actorRoleResolver;
    }

    public async Task<PaginatedResult<ProjectResponseDto>> GetAllAsync(
        int actorUserId,
        int page,
        int pageSize)
    {
        var actor = await RequireActiveActorAsync(actorUserId);
        var pagination = Pagination.Normalize(page, pageSize);
        var query = ApplyReadScope(_db.Projects.AsNoTracking(), actor);
        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderBy(project => project.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<ProjectResponseDto>
        {
            Items = entities.Select(project => ToDto(project, CanViewFinancials(actor.RoleName))).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<ProjectResponseDto?> GetByIdAsync(int actorUserId, int id)
    {
        InputNormalizer.Positive(id, nameof(id));
        var actor = await RequireActiveActorAsync(actorUserId);
        var project = await ApplyReadScope(_db.Projects.AsNoTracking(), actor)
            .FirstOrDefaultAsync(item => item.Id == id);

        // Returning not-found for records outside the actor's scope avoids
        // revealing that another project's record exists.
        return project is null ? null : ToDto(project, CanViewFinancials(actor.RoleName));
    }

    public async Task<ProjectSummaryDto?> GetSummaryAsync(int actorUserId, int id)
    {
        InputNormalizer.Positive(id, nameof(id));
        var actor = await RequireActiveActorAsync(actorUserId);
        var project = await ApplyReadScope(_db.Projects.AsNoTracking(), actor)
            .FirstOrDefaultAsync(item => item.Id == id);

        if (project is null)
        {
            return null;
        }

        var canViewFinancials = CanViewFinancials(actor.RoleName);
        var currentBudget = canViewFinancials
            ? await _db.Set<ProjectBudget>()
                .AsNoTracking()
                .Include(budget => budget.ApprovedByUser)
                .Include(budget => budget.Allocations)
                    .ThenInclude(allocation => allocation.CostCode)
                .Where(budget => budget.ProjectId == id)
                .OrderByDescending(budget => budget.CreatedAt)
                .ThenByDescending(budget => budget.Id)
                .FirstOrDefaultAsync()
            : null;

        var currentAllocations = currentBudget?.Allocations
            .ToDictionary(allocation => allocation.CostCodeId, allocation => allocation.AllocatedAmount)
            ?? [];

        var commitmentRows = canViewFinancials
            ? await _db.PurchaseOrderLines
                .AsNoTracking()
                .Where(line => line.PurchaseOrder.ProjectId == id
                    && (line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Submitted
                        || line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Approved
                        || line.PurchaseOrder.Status == PurchaseOrderWorkflowStates.Issued))
                .Select(line => new
                {
                    line.Requisition.CostCodeId,
                    line.PurchaseOrder.Status,
                    Amount = line.Quantity * line.UnitPrice
                })
                .ToListAsync()
            : [];
        var pendingCommitments = commitmentRows
            .Where(row => row.Status == PurchaseOrderWorkflowStates.Submitted)
            .GroupBy(row => row.CostCodeId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var approvedCommitments = commitmentRows
            .Where(row => row.Status is PurchaseOrderWorkflowStates.Approved
                or PurchaseOrderWorkflowStates.Issued)
            .GroupBy(row => row.CostCodeId)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount));
        var pettyCashRows = canViewFinancials
            ? await _db.PettyCashRequests
                .AsNoTracking()
                .Where(item => item.ProjectId == id
                    && item.AmountCommitted != null
                    && item.Status != PettyCashStatuses.Rejected)
                .GroupBy(item => item.CostCodeId)
                .Select(group => new
                {
                    CostCodeId = group.Key,
                    Amount = group.Sum(item => item.AmountCommitted ?? 0m)
                })
                .ToListAsync()
            : [];
        var pettyCashCommitments = pettyCashRows.ToDictionary(row => row.CostCodeId, row => row.Amount);

        var costCodes = await _db.Set<CostCode>()
            .AsNoTracking()
            .Where(costCode => costCode.ProjectId == id)
            .OrderByDescending(costCode => costCode.IsActive)
            .ThenBy(costCode => costCode.Code)
            .Select(costCode => new CostCodeResponseDto
            {
                Id = costCode.Id,
                ProjectId = costCode.ProjectId,
                Code = costCode.Code,
                Name = costCode.Name,
                IsActive = costCode.IsActive
            })
            .ToListAsync();

        var costCodesWithAllocations = costCodes
            .Select(costCode =>
            {
                var allocation = currentAllocations.GetValueOrDefault(costCode.Id);
                var pending = pendingCommitments.GetValueOrDefault(costCode.Id);
                var approved = approvedCommitments.GetValueOrDefault(costCode.Id)
                    + pettyCashCommitments.GetValueOrDefault(costCode.Id);
                return new CostCodeResponseDto
                {
                    Id = costCode.Id,
                    ProjectId = costCode.ProjectId,
                    Code = costCode.Code,
                    Name = costCode.Name,
                    IsActive = costCode.IsActive,
                    CurrentAllocation = canViewFinancials ? allocation : null,
                    PendingCommitmentAmount = canViewFinancials ? pending : null,
                    ApprovedCommitmentAmount = canViewFinancials ? approved : null,
                    RemainingAfterCommitments = canViewFinancials ? allocation - approved : null
                };
            })
            .ToList();

        var progressQuery = _db.Set<ProjectProgressVerification>()
            .AsNoTracking()
            .Include(verification => verification.VerifiedByUser)
            .Where(verification => verification.ProjectId == id);

        var verificationCount = await progressQuery.CountAsync();
        var latestProgress = await progressQuery
            .OrderByDescending(verification => verification.VerifiedAt)
            .ThenByDescending(verification => verification.Id)
            .FirstOrDefaultAsync();

        return new ProjectSummaryDto
        {
            CanViewFinancials = canViewFinancials,
            Project = ToDto(project, canViewFinancials),
            CurrentBudget = currentBudget is null ? null : ToBudgetDto(currentBudget),
            CostCodes = costCodesWithAllocations,
            LatestProgress = latestProgress is null ? null : ToProgressDto(latestProgress),
            ProgressVerificationCount = verificationCount,
            PendingCommitmentAmount = canViewFinancials
                ? pendingCommitments.Values.Sum()
                : null,
            ApprovedCommitmentAmount = canViewFinancials
                ? approvedCommitments.Values.Sum() + pettyCashCommitments.Values.Sum()
                : null,
            RemainingAfterCommitments = canViewFinancials && currentBudget is not null
                ? currentBudget.ApprovedAmount - approvedCommitments.Values.Sum() - pettyCashCommitments.Values.Sum()
                : null
        };
    }

    public async Task<ProjectResponseDto> CreateAsync(
        int actorUserId,
        CreateProjectRequestDto dto)
    {
        var actor = await RequireRoleAsync(actorUserId, CeoRole);
        var status = NormalizeStatus(dto.Status)
            ?? throw new ArgumentException(GetInvalidStatusMessage(dto.Status), nameof(dto.Status));

        ValidateSchedule(dto.StartDate, dto.EndDate);
        var budgetAmount = InputNormalizer.NonNegative(dto.Budget, nameof(dto.Budget), 18, 2);
        var now = DateTime.UtcNow;

        var project = new Project
        {
            Name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 150),
            Location = InputNormalizer.OptionalText(dto.Location, nameof(dto.Location), 300),
            Budget = budgetAmount,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Status = status,
            CreatedAt = now
        };

        _db.Projects.Add(project);
        _db.Set<ProjectBudget>().Add(new ProjectBudget
        {
            Project = project,
            ApprovedAmount = budgetAmount,
            ApprovedByUserId = actor.Id,
            ApprovalSource = "CEOApproval",
            Notes = "Initial project budget",
            CreatedAt = now
        });

        await _db.SaveChangesAsync();
        return ToDto(project, includeBudget: true);
    }

    public async Task<(ProjectResponseDto? dto, string? error)> UpdateAsync(
        int actorUserId,
        int id,
        UpdateProjectRequestDto dto)
    {
        var actor = await RequireRoleAsync(actorUserId, CeoRole);
        InputNormalizer.Positive(id, nameof(id));

        var status = NormalizeStatus(dto.Status);
        if (status is null)
        {
            return (null, GetInvalidStatusMessage(dto.Status));
        }

        if (dto.StartDate == default)
        {
            return (null, "StartDate is required.");
        }

        if (dto.EndDate.HasValue && dto.EndDate.Value < dto.StartDate)
        {
            return (null, "EndDate cannot be earlier than StartDate.");
        }

        if (dto.Budget < 0)
        {
            return (null, "Budget cannot be negative.");
        }

        if (!DecimalPrecision.Fits(dto.Budget, 18, 2))
        {
            return (null, "Budget must fit within 18 digits and 2 decimal places.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await BudgetCommitmentGuard.LockProjectAsync(_db, id);
        var project = await _db.Projects.SingleOrDefaultAsync(item => item.Id == id);
        if (project is null)
        {
            return (null, null);
        }

        if (project.Budget != dto.Budget)
        {
            var previousBudget = await _db.Set<ProjectBudget>()
                .AsNoTracking()
                .Include(budget => budget.Allocations)
                .Where(budget => budget.ProjectId == project.Id)
                .OrderByDescending(budget => budget.CreatedAt)
                .ThenByDescending(budget => budget.Id)
                .FirstOrDefaultAsync();

            var priorAllocatedAmount = previousBudget?.Allocations
                .Sum(allocation => allocation.AllocatedAmount) ?? 0;
            if (priorAllocatedAmount > dto.Budget)
            {
                return (null,
                    "The new budget is below the current cost-code allocations. " +
                    "Use the budget endpoint to submit a revised allocation split.");
            }

            await BudgetCommitmentGuard.EnsureRevisionCoversCommitmentsAsync(
                _db,
                project.Id,
                dto.Budget,
                previousBudget?.Allocations.ToDictionary(
                    allocation => allocation.CostCodeId,
                    allocation => allocation.AllocatedAmount) ?? new Dictionary<int, decimal>());

            var budgetRevision = new ProjectBudget
            {
                ProjectId = project.Id,
                ApprovedAmount = dto.Budget,
                ApprovedByUserId = actor.Id,
                ApprovalSource = "CEOApproval",
                Notes = "Budget changed with project update",
                CreatedAt = DateTime.UtcNow,
                Allocations = previousBudget?.Allocations
                    .Select(allocation => new ProjectBudgetAllocation
                    {
                        CostCodeId = allocation.CostCodeId,
                        AllocatedAmount = allocation.AllocatedAmount
                    })
                    .ToList() ?? []
            };
            _db.Set<ProjectBudget>().Add(budgetRevision);
        }

        project.Name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 150);
        project.Location = InputNormalizer.OptionalText(dto.Location, nameof(dto.Location), 300);
        project.Budget = dto.Budget;
        project.StartDate = dto.StartDate;
        project.EndDate = dto.EndDate;
        project.Status = status;

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (ToDto(project, includeBudget: true), null);
    }

    public async Task<CostCodeResponseDto> CreateCostCodeAsync(
        int actorUserId,
        int projectId,
        CreateCostCodeRequestDto dto)
    {
        await RequireRoleAsync(actorUserId, CeoRole);
        InputNormalizer.Positive(projectId, nameof(projectId));

        if (!await _db.Projects.AnyAsync(project => project.Id == projectId))
        {
            throw new KeyNotFoundException($"Project with ID {projectId} was not found.");
        }

        var code = InputNormalizer.RequiredText(dto.Code, nameof(dto.Code), 1, 30).ToUpperInvariant();
        var name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 150);

        if (await _db.Set<CostCode>()
            .AnyAsync(item => item.ProjectId == projectId && item.Code == code))
        {
            throw new InvalidOperationException(
                $"Cost code \"{code}\" already exists for this project.");
        }

        var costCode = new CostCode
        {
            ProjectId = projectId,
            Code = code,
            Name = name,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Set<CostCode>().Add(costCode);
        await _db.SaveChangesAsync();

        return new CostCodeResponseDto
        {
            Id = costCode.Id,
            ProjectId = costCode.ProjectId,
            Code = costCode.Code,
            Name = costCode.Name,
            IsActive = costCode.IsActive,
            CurrentAllocation = 0,
            PendingCommitmentAmount = 0,
            ApprovedCommitmentAmount = 0,
            RemainingAfterCommitments = 0
        };
    }

    public async Task<ProjectBudgetResponseDto> SetBudgetAsync(
        int actorUserId,
        int projectId,
        SetProjectBudgetRequestDto dto)
    {
        var actor = await RequireRoleAsync(actorUserId, CeoRole);
        InputNormalizer.Positive(projectId, nameof(projectId));
        var approvedAmount = InputNormalizer.NonNegative(
            dto.ApprovedAmount,
            nameof(dto.ApprovedAmount),
            18,
            2);

        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await BudgetCommitmentGuard.LockProjectAsync(_db, projectId);
        var project = await _db.Projects.SingleOrDefaultAsync(item => item.Id == projectId)
            ?? throw new KeyNotFoundException($"Project with ID {projectId} was not found.");

        var allocationDtos = dto.Allocations ?? [];
        var duplicateCostCode = allocationDtos
            .GroupBy(allocation => allocation.CostCodeId)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicateCostCode is not null)
        {
            throw new ArgumentException(
                "Each cost code may appear only once in a budget revision.",
                nameof(dto.Allocations));
        }

        foreach (var allocation in allocationDtos)
        {
            InputNormalizer.Positive(allocation.CostCodeId, nameof(allocation.CostCodeId));
            InputNormalizer.NonNegative(allocation.Amount, nameof(allocation.Amount), 18, 2);
        }

        var allocatedAmount = allocationDtos.Sum(allocation => allocation.Amount);
        if (allocatedAmount > approvedAmount)
        {
            throw new ArgumentException(
                "Cost-code allocations cannot exceed the approved budget.",
                nameof(dto.Allocations));
        }

        var costCodeIds = allocationDtos.Select(allocation => allocation.CostCodeId).ToList();
        var costCodes = await _db.Set<CostCode>()
            .Where(costCode => costCodeIds.Contains(costCode.Id)
                && costCode.ProjectId == projectId
                && costCode.IsActive)
            .ToDictionaryAsync(costCode => costCode.Id);

        if (costCodes.Count != costCodeIds.Count)
        {
            throw new ArgumentException(
                "Every allocation must reference an active cost code belonging to this project.",
                nameof(dto.Allocations));
        }


        await BudgetCommitmentGuard.EnsureRevisionCoversCommitmentsAsync(
            _db,
            projectId,
            approvedAmount,
            allocationDtos.ToDictionary(
                allocation => allocation.CostCodeId,
                allocation => allocation.Amount));

        var budget = new ProjectBudget
        {
            ProjectId = projectId,
            ApprovedAmount = approvedAmount,
            ApprovedByUserId = actor.Id,
            ApprovedByUser = actor.User,
            ApprovalSource = "CEOApproval",
            Notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000),
            CreatedAt = DateTime.UtcNow,
            Allocations = allocationDtos.Select(allocation => new ProjectBudgetAllocation
            {
                CostCodeId = allocation.CostCodeId,
                CostCode = costCodes[allocation.CostCodeId],
                AllocatedAmount = allocation.Amount
            }).ToList()
        };

        // Project.Budget remains a convenient current-value cache for legacy
        // callers; the ProjectBudgets table is the authoritative history.
        project.Budget = approvedAmount;
        _db.Set<ProjectBudget>().Add(budget);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return ToBudgetDto(budget);
    }

    public async Task<ProjectProgressVerificationResponseDto> AddProgressVerificationAsync(
        int actorUserId,
        int projectId,
        CreateProjectProgressVerificationRequestDto dto)
    {
        var actor = await RequireRoleAsync(actorUserId, EngineerRole);
        InputNormalizer.Positive(projectId, nameof(projectId));

        var assigned = await _db.UserProjectAssignments
            .AsNoTracking()
            .AnyAsync(assignment => assignment.UserId == actor.Id
                && assignment.ProjectId == projectId
                && assignment.IsActive
                && assignment.EndedAt == null);

        if (!assigned && !actor.CanSwitchRoles)
        {
            throw new UnauthorizedAccessException(
                "Engineers may verify progress only for projects currently assigned to them.");
        }

        var projectStatus = await _db.Projects
            .AsNoTracking()
            .Where(project => project.Id == projectId)
            .Select(project => project.Status)
            .FirstOrDefaultAsync();

        if (projectStatus is null)
        {
            throw new KeyNotFoundException($"Project with ID {projectId} was not found.");
        }

        if (projectStatus is "Completed" or "Cancelled")
        {
            throw new InvalidOperationException(
                $"Progress cannot be verified while the project status is \"{projectStatus}\".");
        }

        var percentage = InputNormalizer.NonNegative(
            dto.PercentageComplete,
            nameof(dto.PercentageComplete),
            5,
            2);
        if (percentage > 100)
        {
            throw new ArgumentOutOfRangeException(
                nameof(dto.PercentageComplete),
                "PercentageComplete cannot exceed 100.");
        }

        var verification = new ProjectProgressVerification
        {
            ProjectId = projectId,
            PercentageComplete = percentage,
            WorkSummary = InputNormalizer.RequiredText(
                dto.WorkSummary,
                nameof(dto.WorkSummary),
                5,
                2_000),
            EvidenceReference = InputNormalizer.OptionalText(
                dto.EvidenceReference,
                nameof(dto.EvidenceReference),
                500),
            VerifiedByUserId = actor.Id,
            VerifiedByUser = actor.User,
            VerifiedAt = DateTime.UtcNow
        };

        _db.Set<ProjectProgressVerification>().Add(verification);
        await _db.SaveChangesAsync();
        return ToProgressDto(verification);
    }

    private IQueryable<Project> ApplyReadScope(IQueryable<Project> query, ActorContext actor)
    {
        if (actor.CanSwitchRoles || actor.RoleName is AdministratorRole or CeoRole or AuditorRole)
        {
            return query;
        }

        return query.Where(project => _db.UserProjectAssignments.Any(assignment =>
            assignment.UserId == actor.Id
            && assignment.ProjectId == project.Id
            && assignment.IsActive
            && assignment.EndedAt == null));
    }

    private async Task<ActorContext> RequireActiveActorAsync(int actorUserId)
    {
        InputNormalizer.Positive(actorUserId, nameof(actorUserId));
        var resolvedActor = await _actorRoleResolver.ResolveAsync(actorUserId)
            ?? throw new UnauthorizedAccessException(
                "The signed-in user is missing, inactive, or has an invalid role context.");
        var user = await _db.Users
            .Include(item => item.Role)
            .FirstOrDefaultAsync(item => item.Id == actorUserId && item.IsActive)
            ?? throw new UnauthorizedAccessException("The signed-in user is missing or inactive.");

        return new ActorContext(user, resolvedActor.EffectiveRole, resolvedActor.CanSwitchRoles);
    }

    private async Task<ActorContext> RequireRoleAsync(int actorUserId, string requiredRole)
    {
        var actor = await RequireActiveActorAsync(actorUserId);
        if (!string.Equals(actor.RoleName, requiredRole, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException(
                $"This action requires the {requiredRole} role.");
        }

        return actor;
    }

    private static string? NormalizeStatus(string? status) =>
        AllowedStatuses.FirstOrDefault(allowed =>
            string.Equals(allowed, status?.Trim(), StringComparison.OrdinalIgnoreCase));

    private static string GetInvalidStatusMessage(string? status)
    {
        var allowed = string.Join(", ", AllowedStatuses.Select(value => $"\"{value}\""));
        return $"Invalid status \"{status}\". Allowed values: {allowed}.";
    }

    private static void ValidateSchedule(DateOnly startDate, DateOnly? endDate)
    {
        if (startDate == default)
        {
            throw new ArgumentException("StartDate is required.", nameof(startDate));
        }

        if (endDate.HasValue && endDate.Value < startDate)
        {
            throw new ArgumentException("EndDate cannot be earlier than StartDate.", nameof(endDate));
        }
    }

    private static bool CanViewFinancials(string roleName) =>
        FinancialReadRoles.Contains(roleName);

    private static ProjectResponseDto ToDto(Project project, bool includeBudget) => new()
    {
        Id = project.Id,
        Name = project.Name,
        Location = project.Location,
        Budget = includeBudget ? project.Budget : null,
        StartDate = project.StartDate,
        EndDate = project.EndDate,
        Status = project.Status,
        CreatedAt = project.CreatedAt
    };

    private static ProjectBudgetResponseDto ToBudgetDto(ProjectBudget budget) => new()
    {
        Id = budget.Id,
        ProjectId = budget.ProjectId,
        ApprovedAmount = budget.ApprovedAmount,
        AllocatedAmount = budget.Allocations.Sum(allocation => allocation.AllocatedAmount),
        ApprovedByUserId = budget.ApprovedByUserId,
        ApprovedByUserName = budget.ApprovedByUser?.FullName,
        ApprovalSource = budget.ApprovalSource,
        Notes = budget.Notes,
        CreatedAt = budget.CreatedAt,
        Allocations = budget.Allocations
            .OrderBy(allocation => allocation.CostCode?.Code)
            .Select(allocation => new BudgetAllocationResponseDto
            {
                CostCodeId = allocation.CostCodeId,
                CostCode = allocation.CostCode?.Code ?? string.Empty,
                CostCodeName = allocation.CostCode?.Name ?? string.Empty,
                Amount = allocation.AllocatedAmount
            })
            .ToList()
    };

    private static ProjectProgressVerificationResponseDto ToProgressDto(
        ProjectProgressVerification verification) => new()
        {
            Id = verification.Id,
            ProjectId = verification.ProjectId,
            PercentageComplete = verification.PercentageComplete,
            WorkSummary = verification.WorkSummary,
            EvidenceReference = verification.EvidenceReference,
            VerifiedByUserId = verification.VerifiedByUserId,
            VerifiedByUserName = verification.VerifiedByUser?.FullName ?? string.Empty,
            VerifiedAt = verification.VerifiedAt
        };

    private sealed record ActorContext(User User, string RoleName, bool CanSwitchRoles)
    {
        public int Id => User.Id;
    }
}
