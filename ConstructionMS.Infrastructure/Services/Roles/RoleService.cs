namespace ConstructionMS.Infrastructure.Services.Roles;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Roles;
using ConstructionMS.Application.Services.Roles;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

/// <summary>EF Core read service for fixed system roles.</summary>
public class RoleService : IRoleService
{
    private readonly AppDbContext _db;

    public RoleService(AppDbContext db) => _db = db;

    public async Task<PaginatedResult<RoleResponseDto>> GetAllAsync(int page, int pageSize)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var query = _db.Roles.AsNoTracking();

        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderBy(r => r.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<RoleResponseDto>
        {
            Items = entities.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<RoleResponseDto?> GetByIdAsync(int id)
    {
        var role = await _db.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        return role is null ? null : ToDto(role);
    }

    private static RoleResponseDto ToDto(Role r) => new()
    {
        Id = r.Id,
        RoleName = r.RoleName,
        Description = r.Description,
        CreatedAt = r.CreatedAt
    };
}
