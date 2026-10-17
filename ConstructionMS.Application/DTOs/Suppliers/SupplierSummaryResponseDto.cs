namespace ConstructionMS.Application.DTOs.Suppliers;

/// <summary>
/// Minimal supplier information used when selecting a vendor for sourcing.
/// Payment, tax and contact details are intentionally omitted from collection
/// responses and are available only through the protected detail endpoint.
/// </summary>
public sealed class SupplierSummaryResponseDto
{
    public int Id { get; init; }

    public string Name { get; init; } = string.Empty;

    public string? Category { get; init; }

    public bool IsBlacklisted { get; init; }

    public DateTime CreatedAt { get; init; }
}
