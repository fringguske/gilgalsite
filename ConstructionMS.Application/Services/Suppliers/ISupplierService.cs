namespace ConstructionMS.Application.Services.Suppliers;

using ConstructionMS.Application.Common;
using ConstructionMS.Application.DTOs.Suppliers;

/// <summary>
/// Business operations for Suppliers.
/// Hard deletion is deliberately unsupported so supplier history can be retained.
/// </summary>
public interface ISupplierService
{
    Task<PaginatedResult<SupplierResponseDto>> GetAllAsync(int page, int pageSize);
    Task<SupplierResponseDto?> GetByIdAsync(int id);
    Task<SupplierResponseDto?> UpdateAsync(int id, UpdateSupplierRequestDto dto);

    /// <summary>
    /// Sets the supplier's blacklist state explicitly. Returns false if not found.
    /// </summary>
    Task<bool> SetBlacklistStatusAsync(int id, bool isBlacklisted);
}
