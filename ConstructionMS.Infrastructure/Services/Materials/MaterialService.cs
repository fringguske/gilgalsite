namespace ConstructionMS.Infrastructure.Services.Materials;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Materials;
using ConstructionMS.Application.Services.Materials;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System.Data;

/// <summary>EF Core implementation of IMaterialService.</summary>
public class MaterialService : IMaterialService
{
    private const string NormalizedNameProperty = "NormalizedName";
    private const string NormalizedUnitProperty = "NormalizedUnit";
    private readonly AppDbContext _db;

    public MaterialService(AppDbContext db) => _db = db;

    public async Task<PaginatedResult<MaterialResponseDto>> GetAllAsync(int page, int pageSize)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var query = _db.Materials.AsNoTracking();
        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderBy(m => m.Name)
            .ThenBy(m => m.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<MaterialResponseDto>
        {
            Items = entities.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<MaterialResponseDto?> GetByIdAsync(int id)
    {
        var material = await _db.Materials.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);
        return material is null ? null : ToDto(material);
    }

    public async Task<MaterialResponseDto> CreateAsync(CreateMaterialRequestDto dto)
    {
        var name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 150);
        var unit = InputNormalizer.RequiredText(dto.Unit, nameof(dto.Unit), maximumLength: 30);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        if (await HasEquivalentAsync(name, unit))
        {
            throw new InvalidOperationException("That material and unit already exist in the catalog.");
        }

        var material = new Material
        {
            Name = name,
            Category = InputNormalizer.OptionalText(dto.Category, nameof(dto.Category), 100),
            Unit = unit,
            StandardPrice = InputNormalizer.NonNegative(dto.StandardPrice, nameof(dto.StandardPrice), 18, 2),
            ReorderLevel = InputNormalizer.NonNegative(dto.ReorderLevel, nameof(dto.ReorderLevel), 18, 3),
            RequiresTechnicalAcceptance = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Materials.Add(material);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return ToDto(material);
    }

    public async Task<MaterialResponseDto?> UpdateAsync(int id, UpdateMaterialRequestDto dto)
    {
        var name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 150);
        var category = InputNormalizer.OptionalText(dto.Category, nameof(dto.Category), 100);
        var unit = InputNormalizer.RequiredText(dto.Unit, nameof(dto.Unit), maximumLength: 30);
        var standardPrice = InputNormalizer.NonNegative(dto.StandardPrice, nameof(dto.StandardPrice), 18, 2);
        var reorderLevel = InputNormalizer.NonNegative(dto.ReorderLevel, nameof(dto.ReorderLevel), 18, 3);
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"Materials\" WHERE \"Id\" = {id} FOR UPDATE");
        var material = await _db.Materials.SingleOrDefaultAsync(item => item.Id == id);
        if (material is null)
        {
            await transaction.RollbackAsync();
            return null;
        }

        if (await HasEquivalentAsync(name, unit, id))
        {
            throw new InvalidOperationException("That material and unit already exist in the catalog.");
        }

        if (!string.Equals(material.Unit, unit, StringComparison.Ordinal)
            && (await _db.Requisitions.AnyAsync(item => item.MaterialId == id)
                || await _db.StockBalances.AnyAsync(item => item.MaterialId == id)
                || await _db.StockLedgerEntries.AnyAsync(item => item.MaterialId == id)
                || await _db.StockTransfers.AnyAsync(item => item.MaterialId == id)
                || await _db.OpeningInventoryLines.AnyAsync(item => item.MaterialId == id)))
            throw new InvalidOperationException("The material unit cannot change after the material has transaction history.");

        material.Name = name;
        material.Category = category;
        material.Unit = unit;
        material.StandardPrice = standardPrice;
        material.ReorderLevel = reorderLevel;
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return ToDto(material);
    }

    private Task<bool> HasEquivalentAsync(string name, string unit, int? excludingId = null)
    {
        var nameKey = name.Trim().ToLowerInvariant();
        var unitKey = unit.Trim().ToLowerInvariant();
        return _db.Materials.AsNoTracking().AnyAsync(material =>
            (!excludingId.HasValue || material.Id != excludingId.Value)
            && EF.Property<string>(material, NormalizedNameProperty) == nameKey
            && EF.Property<string>(material, NormalizedUnitProperty) == unitKey);
    }

    public async Task<MaterialResponseDto?> SetTechnicalAcceptancePolicyAsync(
        int id,
        bool required,
        int actorUserId)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT 1 FROM \"Materials\" WHERE \"Id\" = {id} FOR UPDATE");
        var material = await _db.Materials.SingleOrDefaultAsync(item => item.Id == id);
        if (material is null) return null;

        if (material.RequiresTechnicalAcceptance == required)
        {
            await transaction.CommitAsync();
            return ToDto(material);
        }
        var previous = material.RequiresTechnicalAcceptance;
        material.RequiresTechnicalAcceptance = required;
        _db.MaterialTechnicalAcceptancePolicyEvents.Add(new MaterialTechnicalAcceptancePolicyEvent
        {
            MaterialId = material.Id,
            PreviousRequired = previous,
            Required = required,
            ChangedByUserId = actorUserId,
            ChangedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();
        return ToDto(material);
    }

    private static MaterialResponseDto ToDto(Material m) => new()
    {
        Id = m.Id,
        Name = m.Name,
        Category = m.Category,
        Unit = m.Unit,
        StandardPrice = m.StandardPrice,
        ReorderLevel = m.ReorderLevel,
        RequiresTechnicalAcceptance = m.RequiresTechnicalAcceptance,
        CreatedAt = m.CreatedAt
    };
}
