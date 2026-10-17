namespace ConstructionMS.Domain.Entities;

public static class MaterialCatalogRequestStatuses
{
    public const string Pending = "Pending";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>
/// A Foreman's proposal for a material that is not yet in the shared catalog.
/// Approval links the proposal to one catalog material; it does not create a
/// site requisition on the Foreman's behalf.
/// </summary>
public sealed class MaterialCatalogRequest
{
    public int Id { get; set; }
    public string RequestNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string Unit { get; set; } = string.Empty;
    public string Purpose { get; set; } = string.Empty;
    public string Status { get; set; } = MaterialCatalogRequestStatuses.Pending;
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public int? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
    public int? ApprovedMaterialId { get; set; }
    public Material? ApprovedMaterial { get; set; }
}
