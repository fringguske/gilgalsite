namespace ConstructionMS.Application.DTOs.Suppliers;

/// <summary>Explicitly sets whether a supplier is blocked from procurement.</summary>
public sealed class SetSupplierBlacklistRequestDto
{
    public bool IsBlacklisted { get; init; }
}
