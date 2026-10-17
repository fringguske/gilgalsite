namespace ConstructionMS.Infrastructure.Services.Materials;

using System.Data;
using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;
using ConstructionMS.Application.Services.Auth;
using ConstructionMS.Application.Services.Materials;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

public sealed class MaterialCatalogRequestService(
    AppDbContext db,
    IActorRoleResolver actorRoleResolver) : IMaterialCatalogRequestService
{
    private const string ForemanRole = "Foreman";
    private const string ProcurementRole = "Procurement Officer";
    private const string NormalizedNameProperty = "NormalizedName";
    private const string NormalizedUnitProperty = "NormalizedUnit";
    private static readonly string[] ReadRoles =
    [
        ForemanRole,
        ProcurementRole,
        "CEO",
        "Auditor"
    ];
    private static readonly string[] AllowedStatuses =
    [
        MaterialCatalogRequestStatuses.Pending,
        MaterialCatalogRequestStatuses.Approved,
        MaterialCatalogRequestStatuses.Rejected
    ];
    private readonly ControlEventWriter _events = new(db);

    public async Task<PaginatedResult<MaterialCatalogRequestResponseDto>> GetAllAsync(
        int page,
        int pageSize,
        string? status,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireRoleAsync(
            actorUserId,
            actorRole,
            ReadRoles,
            cancellationToken);
        var pagination = Pagination.Normalize(page, pageSize);
        var normalizedStatus = NormalizeStatus(status);

        var query = RequestQuery(db.MaterialCatalogRequests.AsNoTracking());
        if (actor.EffectiveRole == ForemanRole)
        {
            query = query.Where(request => request.SubmittedByUserId == actor.UserId);
        }
        else if (actor.EffectiveRole == ProcurementRole && !actor.CanSwitchRoles)
        {
            query = query.Where(request => db.UserProjectAssignments.Any(assignment =>
                assignment.UserId == actor.UserId
                && assignment.ProjectId == request.ProjectId
                && assignment.IsActive));
        }

        if (normalizedStatus is not null)
        {
            query = query.Where(request => request.Status == normalizedStatus);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var requests = await query
            .OrderBy(request => request.Status == MaterialCatalogRequestStatuses.Pending ? 0 : 1)
            .ThenByDescending(request => request.SubmittedAt)
            .ThenByDescending(request => request.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync(cancellationToken);

        return new PaginatedResult<MaterialCatalogRequestResponseDto>
        {
            Items = requests.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<MaterialCatalogRequestResponseDto> SubmitAsync(
        CreateMaterialCatalogRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireRoleAsync(
            actorUserId,
            actorRole,
            [ForemanRole],
            cancellationToken);
        var projectId = InputNormalizer.Positive(request.ProjectId, nameof(request.ProjectId));
        var name = InputNormalizer.RequiredText(request.Name, nameof(request.Name), 2, 150);
        var category = InputNormalizer.OptionalText(request.Category, nameof(request.Category), 100);
        var unit = InputNormalizer.RequiredText(request.Unit, nameof(request.Unit), maximumLength: 30);
        var purpose = InputNormalizer.RequiredText(request.Purpose, nameof(request.Purpose), 3, 500);
        var nameKey = NormalizeIdentity(name);
        var unitKey = NormalizeIdentity(unit);

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var projectStatus = await db.Projects.AsNoTracking()
            .Where(project => project.Id == projectId)
            .Select(project => project.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (projectStatus is null)
        {
            throw new ArgumentException("The selected project does not exist.", nameof(request.ProjectId));
        }

        if (projectStatus != "Active")
        {
            throw new InvalidOperationException("The selected project is not active.");
        }

        if (!await db.UserProjectAssignments.AsNoTracking().AnyAsync(
                assignment => assignment.UserId == actor.UserId
                    && assignment.ProjectId == projectId
                    && assignment.IsActive,
                cancellationToken))
        {
            throw new UnauthorizedAccessException("You are not assigned to the selected project.");
        }

        if (await db.MaterialCatalogRequests.AsNoTracking().AnyAsync(
                candidate => candidate.Status == MaterialCatalogRequestStatuses.Pending
                    && EF.Property<string>(candidate, NormalizedNameProperty) == nameKey
                    && EF.Property<string>(candidate, NormalizedUnitProperty) == unitKey,
                cancellationToken))
        {
            throw new InvalidOperationException("That material already has a request awaiting review.");
        }

        var now = DateTime.UtcNow;
        var catalogRequest = new MaterialCatalogRequest
        {
            RequestNumber = $"MCR-{now:yyMMddHHmmss}-{Guid.NewGuid():N}"[..28].ToUpperInvariant(),
            ProjectId = projectId,
            Name = name,
            Category = category,
            Unit = unit,
            Purpose = purpose,
            Status = MaterialCatalogRequestStatuses.Pending,
            SubmittedByUserId = actor.UserId,
            SubmittedAt = now
        };

        db.MaterialCatalogRequests.Add(catalogRequest);
        await db.SaveChangesAsync(cancellationToken);
        await _events.AppendAsync(
            $"material-catalog:{catalogRequest.Id}",
            requisitionId: null,
            projectId,
            entityType: nameof(MaterialCatalogRequest),
            entityId: catalogRequest.Id,
            referenceNumber: catalogRequest.RequestNumber,
            eventType: "MaterialCatalogRequested",
            actorUserId: actor.UserId,
            actorRole: actor.EffectiveRole,
            details: new
            {
                catalogRequest.Name,
                catalogRequest.Category,
                catalogRequest.Unit,
                catalogRequest.Purpose
            },
            occurredAt: now,
            cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return await LoadAsync(catalogRequest.Id, cancellationToken);
    }

    public async Task<MaterialCatalogRequestResponseDto> ReviewAsync(
        int requestId,
        ReviewMaterialCatalogRequestDto request,
        int actorUserId,
        string actorRole,
        CancellationToken cancellationToken = default)
    {
        InputNormalizer.Positive(requestId, nameof(requestId));
        var actor = await RequireRoleAsync(
            actorUserId,
            actorRole,
            [ProcurementRole],
            cancellationToken);
        var notes = InputNormalizer.RequiredText(request.Notes, nameof(request.Notes), 3, 1_000);

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"MaterialCatalogRequests\" WHERE \"Id\" = {requestId} FOR UPDATE",
            cancellationToken);
        var catalogRequest = await db.MaterialCatalogRequests
            .SingleOrDefaultAsync(candidate => candidate.Id == requestId, cancellationToken)
            ?? throw new KeyNotFoundException("The material catalog request was not found.");

        if (catalogRequest.Status != MaterialCatalogRequestStatuses.Pending)
        {
            throw new InvalidOperationException("This material catalog request already has a final decision.");
        }

        if (catalogRequest.SubmittedByUserId == actor.UserId)
        {
            throw new UnauthorizedAccessException("The requester cannot review the same material.");
        }

        if (!actor.CanSwitchRoles && !await db.UserProjectAssignments.AsNoTracking().AnyAsync(
                assignment => assignment.UserId == actor.UserId
                    && assignment.ProjectId == catalogRequest.ProjectId
                    && assignment.IsActive,
                cancellationToken))
        {
            throw new UnauthorizedAccessException("You are not assigned to this project.");
        }

        var now = DateTime.UtcNow;
        Material? approvedMaterial = null;
        var linkedExisting = false;
        if (request.Approve)
        {
            var nameKey = NormalizeIdentity(catalogRequest.Name);
            var unitKey = NormalizeIdentity(catalogRequest.Unit);
            approvedMaterial = await db.Materials.SingleOrDefaultAsync(
                material => EF.Property<string>(material, NormalizedNameProperty) == nameKey
                    && EF.Property<string>(material, NormalizedUnitProperty) == unitKey,
                cancellationToken);
            linkedExisting = approvedMaterial is not null;

            if (approvedMaterial is null)
            {
                approvedMaterial = new Material
                {
                    Name = catalogRequest.Name,
                    Category = catalogRequest.Category,
                    Unit = catalogRequest.Unit,
                    StandardPrice = 0,
                    ReorderLevel = 0,
                    RequiresTechnicalAcceptance = true,
                    CreatedAt = now
                };
                db.Materials.Add(approvedMaterial);
            }
        }

        catalogRequest.Status = request.Approve
            ? MaterialCatalogRequestStatuses.Approved
            : MaterialCatalogRequestStatuses.Rejected;
        catalogRequest.ReviewedByUserId = actor.UserId;
        catalogRequest.ReviewedAt = now;
        catalogRequest.ReviewNotes = notes;
        catalogRequest.ApprovedMaterial = approvedMaterial;

        await db.SaveChangesAsync(cancellationToken);
        await _events.AppendAsync(
            $"material-catalog:{catalogRequest.Id}",
            requisitionId: null,
            catalogRequest.ProjectId,
            entityType: nameof(MaterialCatalogRequest),
            entityId: catalogRequest.Id,
            referenceNumber: catalogRequest.RequestNumber,
            eventType: request.Approve ? "MaterialCatalogApproved" : "MaterialCatalogRejected",
            actorUserId: actor.UserId,
            actorRole: actor.EffectiveRole,
            details: new
            {
                catalogRequest.Name,
                catalogRequest.Unit,
                ApprovedMaterialId = approvedMaterial?.Id,
                LinkedExisting = request.Approve && linkedExisting,
                Notes = notes
            },
            occurredAt: now,
            cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return await LoadAsync(catalogRequest.Id, cancellationToken);
    }

    private async Task<MaterialCatalogRequestResponseDto> LoadAsync(
        int id,
        CancellationToken cancellationToken)
    {
        var request = await RequestQuery(db.MaterialCatalogRequests.AsNoTracking())
            .SingleAsync(candidate => candidate.Id == id, cancellationToken);
        return ToDto(request);
    }

    private async Task<ActorRoleContext> RequireRoleAsync(
        int actorUserId,
        string actorRole,
        IReadOnlyCollection<string> allowedRoles,
        CancellationToken cancellationToken)
    {
        var actor = await actorRoleResolver.ResolveAsync(actorUserId, actorRole, cancellationToken);
        if (actor is null || !allowedRoles.Contains(actor.EffectiveRole, StringComparer.Ordinal))
        {
            throw new UnauthorizedAccessException("Your role cannot perform this material catalog action.");
        }

        return actor;
    }

    private static string? NormalizeStatus(string? status) =>
        string.IsNullOrWhiteSpace(status)
            ? null
            : AllowedStatuses.FirstOrDefault(candidate =>
                string.Equals(candidate, status.Trim(), StringComparison.OrdinalIgnoreCase))
              ?? throw new ArgumentException(
                  "Status must be Pending, Approved, or Rejected.",
                  nameof(status));

    private static string NormalizeIdentity(string value) => value.Trim().ToLowerInvariant();

    private static IQueryable<MaterialCatalogRequest> RequestQuery(
        IQueryable<MaterialCatalogRequest> query) => query
        .Include(request => request.Project)
        .Include(request => request.SubmittedByUser)
        .Include(request => request.ReviewedByUser);

    private static MaterialCatalogRequestResponseDto ToDto(MaterialCatalogRequest request) => new()
    {
        Id = request.Id,
        RequestNumber = request.RequestNumber,
        ProjectId = request.ProjectId,
        ProjectName = request.Project.Name,
        Name = request.Name,
        Category = request.Category,
        Unit = request.Unit,
        Purpose = request.Purpose,
        Status = request.Status,
        SubmittedByUserId = request.SubmittedByUserId,
        SubmittedByName = request.SubmittedByUser.FullName,
        SubmittedAt = request.SubmittedAt,
        ReviewedByUserId = request.ReviewedByUserId,
        ReviewedByName = request.ReviewedByUser?.FullName,
        ReviewedAt = request.ReviewedAt,
        ReviewNotes = request.ReviewNotes,
        ApprovedMaterialId = request.ApprovedMaterialId
    };
}
