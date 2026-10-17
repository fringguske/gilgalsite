namespace ConstructionMS.Infrastructure.Services.Requisitions;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Requisitions;
using ConstructionMS.Application.Services.Requisitions;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

/// <summary>Persists requisitions and enforces requester/approver separation.</summary>
public class RequisitionService : IRequisitionService
{
    private const string PendingStatus = "Pending";
    private static readonly string[] FilterStatuses = [PendingStatus, "Approved", "Rejected"];

    private readonly AppDbContext _db;

    public RequisitionService(AppDbContext db) => _db = db;

    private IQueryable<Requisition> BaseQuery() =>
        _db.Requisitions
            .Include(r => r.Project)
            .Include(r => r.Material)
            .Include(r => r.RequestedByUser)
            .Include(r => r.ApprovedByUser)
            .AsNoTracking();

    public async Task<PaginatedResult<RequisitionResponseDto>> GetAllAsync(
        int page, int pageSize, string? status = null, int? projectId = null)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var query = BaseQuery();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = FilterStatuses.FirstOrDefault(allowed =>
                string.Equals(allowed, status.Trim(), StringComparison.OrdinalIgnoreCase));

            if (normalizedStatus is null)
            {
                throw new ArgumentException("The requisition status filter is invalid.", nameof(status));
            }

            query = query.Where(r => r.Status == normalizedStatus);
        }

        if (projectId is <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(projectId), "The project ID must be greater than zero.");
        }

        if (projectId.HasValue)
        {
            query = query.Where(r => r.ProjectId == projectId.Value);
        }

        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderByDescending(r => r.CreatedAt) // newest first for operations teams
            .ThenByDescending(r => r.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<RequisitionResponseDto>
        {
            Items = entities.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<RequisitionResponseDto?> GetByIdAsync(int id)
    {
        var req = await BaseQuery().FirstOrDefaultAsync(r => r.Id == id);
        return req is null ? null : ToDto(req);
    }

    public async Task<RequisitionResponseDto> CreateAsync(CreateRequisitionRequestDto dto)
    {
        InputNormalizer.Positive(dto.ProjectId, nameof(dto.ProjectId));
        InputNormalizer.Positive(dto.MaterialId, nameof(dto.MaterialId));
        InputNormalizer.Positive(dto.RequestedByUserId, nameof(dto.RequestedByUserId));

        if (!await _db.Projects.AnyAsync(project => project.Id == dto.ProjectId))
        {
            throw new ArgumentException("The selected project does not exist.", nameof(dto.ProjectId));
        }

        if (!await _db.Materials.AnyAsync(material => material.Id == dto.MaterialId))
        {
            throw new ArgumentException("The selected material does not exist.", nameof(dto.MaterialId));
        }

        if (!await _db.Users.AnyAsync(user => user.Id == dto.RequestedByUserId && user.IsActive))
        {
            throw new ArgumentException("The requester does not exist or is inactive.", nameof(dto.RequestedByUserId));
        }

        var requisition = new Requisition
        {
            ProjectId = dto.ProjectId,
            MaterialId = dto.MaterialId,
            Quantity = InputNormalizer.Positive(dto.Quantity, nameof(dto.Quantity), 18, 3),
            RequestedByUserId = dto.RequestedByUserId,
            Status = PendingStatus,
            Notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000),
            CreatedAt = DateTime.UtcNow
        };

        _db.Requisitions.Add(requisition);
        await _db.SaveChangesAsync();

        return await GetByIdAsync(requisition.Id)
            ?? throw new InvalidOperationException("Requisition was saved but could not be retrieved.");
    }

    public async Task<(RequisitionResponseDto? dto, string? error)> UpdateAsync(
        int id, UpdateRequisitionRequestDto dto)
    {
        var req = await _db.Requisitions
            .AsNoTracking()
            .Where(requisition => requisition.Id == id)
            .Select(requisition => new { requisition.Status })
            .FirstOrDefaultAsync();

        if (req is null) return (null, null);

        if (req.Status != PendingStatus)
            return (null, $"Only Pending requisitions can be edited. Current status: \"{req.Status}\".");

        var quantity = InputNormalizer.Positive(dto.Quantity, nameof(dto.Quantity), 18, 3);
        var notes = InputNormalizer.OptionalText(dto.Notes, nameof(dto.Notes), 1_000);

        var updatedRows = await _db.Requisitions
            .Where(requisition => requisition.Id == id && requisition.Status == PendingStatus)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(requisition => requisition.Quantity, quantity)
                .SetProperty(requisition => requisition.Notes, notes));

        if (updatedRows == 0)
        {
            return (null, "The requisition was actioned by another user. Refresh and try again.");
        }

        var updated = await GetByIdAsync(id);
        return (updated, null);
    }

    public async Task<(RequisitionResponseDto? dto, string? error)> ApproveAsync(
        int id, int approvedByUserId)
    {
        return await ActionRequisitionAsync(id, approvedByUserId, "Approved");
    }

    public async Task<(RequisitionResponseDto? dto, string? error)> RejectAsync(
        int id, int approvedByUserId)
    {
        return await ActionRequisitionAsync(id, approvedByUserId, "Rejected");
    }

    private async Task<(RequisitionResponseDto? dto, string? error)> ActionRequisitionAsync(
        int id, int approvedByUserId, string newStatus)
    {
        var req = await _db.Requisitions
            .AsNoTracking()
            .FirstOrDefaultAsync(requisition => requisition.Id == id);

        if (req is null) return (null, null);

        if (req.Status != PendingStatus)
            return (null, $"Only Pending requisitions can be actioned. Current status: \"{req.Status}\".");

        InputNormalizer.Positive(approvedByUserId, nameof(approvedByUserId));

        var approverIsActive = await _db.Users
            .AsNoTracking()
            .AnyAsync(user => user.Id == approvedByUserId && user.IsActive);

        if (!approverIsActive)
        {
            return (null, "The selected approver does not exist or is inactive.");
        }

        if (SegregationOfDutiesChecker.IsSameUser(req.RequestedByUserId, approvedByUserId))
        {
            return (null, SegregationOfDutiesChecker.GetViolationMessage("requester", "approver"));
        }

        var actionedAt = DateTime.UtcNow;
        var updatedRows = await _db.Requisitions
            .Where(requisition => requisition.Id == id && requisition.Status == PendingStatus)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(requisition => requisition.Status, newStatus)
                .SetProperty(requisition => requisition.ApprovedByUserId, (int?)approvedByUserId)
                .SetProperty(requisition => requisition.ApprovedAt, actionedAt));

        if (updatedRows == 0)
        {
            return (null, "The requisition was actioned by another user. Refresh and try again.");
        }

        var result = await GetByIdAsync(id);
        return (result, null);
    }

    private static RequisitionResponseDto ToDto(Requisition r) => new()
    {
        Id = r.Id,
        ProjectId = r.ProjectId,
        ProjectName = r.Project?.Name ?? string.Empty,
        MaterialId = r.MaterialId,
        MaterialName = r.Material?.Name ?? string.Empty,
        MaterialUnit = r.Material?.Unit ?? string.Empty,
        Quantity = r.Quantity,
        RequestedByUserId = r.RequestedByUserId,
        RequestedByUserName = r.RequestedByUser?.FullName ?? string.Empty,
        ApprovedByUserId = r.ApprovedByUserId,
        ApprovedByUserName = r.ApprovedByUser?.FullName,
        Status = r.Status,
        Notes = r.Notes,
        CreatedAt = r.CreatedAt,
        ApprovedAt = r.ApprovedAt
    };
}
