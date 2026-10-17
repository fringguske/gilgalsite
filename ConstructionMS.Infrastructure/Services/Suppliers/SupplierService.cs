namespace ConstructionMS.Infrastructure.Services.Suppliers;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;
using ConstructionMS.Application.Services.Suppliers;
using ConstructionMS.Domain.Entities;
using ConstructionMS.Infrastructure.Common;
using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

/// <summary>EF Core implementation of ISupplierService.</summary>
public class SupplierService : ISupplierService
{
    private const string NormalizedKraPinProperty = "NormalizedKraPin";
    private readonly AppDbContext _db;

    public SupplierService(AppDbContext db) => _db = db;

    public async Task<PaginatedResult<SupplierResponseDto>> GetAllAsync(int page, int pageSize)
    {
        var pagination = Pagination.Normalize(page, pageSize);
        var query = _db.Suppliers.AsNoTracking();
        var totalCount = await query.CountAsync();

        var entities = await query
            .OrderBy(s => s.Name)
            .ThenBy(s => s.Id)
            .Skip(pagination.Offset)
            .Take(pagination.PageSize)
            .ToListAsync();

        return new PaginatedResult<SupplierResponseDto>
        {
            Items = entities.Select(ToDto).ToList(),
            TotalCount = totalCount,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<SupplierResponseDto?> GetByIdAsync(int id)
    {
        var supplier = await _db.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        return supplier is null ? null : ToDto(supplier);
    }

    public async Task<SupplierResponseDto?> UpdateAsync(int id, UpdateSupplierRequestDto dto)
    {
        var supplier = await _db.Suppliers.FindAsync(id);
        if (supplier is null) return null;

        var kraPin = InputNormalizer.OptionalUppercase(dto.KraPin, nameof(dto.KraPin), 20);
        if (kraPin is not null && await _db.Suppliers.AnyAsync(existing =>
                existing.Id != id
                && EF.Property<string?>(existing, NormalizedKraPinProperty) == kraPin))
        {
            throw new InvalidOperationException("A supplier with that KRA PIN already exists.");
        }

        supplier.Name = InputNormalizer.RequiredText(dto.Name, nameof(dto.Name), 2, 200);
        supplier.ContactPerson = InputNormalizer.OptionalText(dto.ContactPerson, nameof(dto.ContactPerson), 150);
        supplier.PhoneNumber = InputNormalizer.OptionalText(dto.PhoneNumber, nameof(dto.PhoneNumber), 30);
        supplier.Email = InputNormalizer.OptionalEmail(dto.Email, nameof(dto.Email));
        supplier.KraPin = kraPin;
        supplier.MpesaNumber = InputNormalizer.OptionalText(dto.MpesaNumber, nameof(dto.MpesaNumber), 30);
        supplier.Category = InputNormalizer.OptionalText(dto.Category, nameof(dto.Category), 100);
        await _db.SaveChangesAsync();
        return ToDto(supplier);
    }

    public async Task<bool> SetBlacklistStatusAsync(int id, bool isBlacklisted)
    {
        var supplier = await _db.Suppliers.FindAsync(id);
        if (supplier is null) return false;

        supplier.IsBlacklisted = isBlacklisted;
        await _db.SaveChangesAsync();
        return true;
    }

    private static SupplierResponseDto ToDto(Supplier s) => new()
    {
        Id = s.Id,
        Name = s.Name,
        ContactPerson = s.ContactPerson,
        PhoneNumber = s.PhoneNumber,
        Email = s.Email,
        KraPin = s.KraPin,
        MpesaNumber = s.MpesaNumber,
        Category = s.Category,
        IsBlacklisted = s.IsBlacklisted,
        CreatedAt = s.CreatedAt
    };
}
