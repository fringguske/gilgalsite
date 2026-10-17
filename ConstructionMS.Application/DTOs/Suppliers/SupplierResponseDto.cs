namespace ConstructionMS.Application.DTOs.Suppliers;

/// <summary>
/// Represents a Supplier as returned by the API.
/// Includes all fields except internal/system fields. The full contact
/// picture is useful for procurement officers building purchase orders.
/// </summary>
public class SupplierResponseDto
{
    public int Id { get; set; }

    /// <summary>Registered business name of the supplier.</summary>
    public string Name { get; set; } = string.Empty;

    public string? ContactPerson { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }

    /// <summary>Kenya Revenue Authority PIN, required for formal procurement.</summary>
    public string? KraPin { get; set; }

    /// <summary>M-Pesa business/till number for mobile payment.</summary>
    public string? MpesaNumber { get; set; }

    /// <summary>Grouping category, e.g. "Hardware", "Labour", "Transport".</summary>
    public string? Category { get; set; }

    /// <summary>Whether the supplier is currently blacklisted.</summary>
    public bool IsBlacklisted { get; set; }

    public DateTime CreatedAt { get; set; }
}
