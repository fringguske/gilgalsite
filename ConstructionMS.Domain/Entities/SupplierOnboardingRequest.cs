namespace ConstructionMS.Domain.Entities;

public static class SupplierOnboardingStatuses
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>
/// An immutable supplier proposal followed by one independent, terminal review.
/// Approved proposals create a Supplier record; rejected proposals never enter
/// the supplier register used for sourcing.
/// </summary>
public sealed class SupplierOnboardingRequest
{
    public int Id { get; set; }
    public string RequestNumber { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ContactPerson { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string KraPin { get; set; } = string.Empty;
    public string? MpesaNumber { get; set; }
    public string Category { get; set; } = string.Empty;
    public string Status { get; set; } = SupplierOnboardingStatuses.Pending;
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public int? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
    public int? ApprovedSupplierId { get; set; }
    public Supplier? ApprovedSupplier { get; set; }
}
