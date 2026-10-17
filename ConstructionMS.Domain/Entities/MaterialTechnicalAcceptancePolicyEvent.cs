namespace ConstructionMS.Domain.Entities;

/// <summary>Append-only evidence of a CEO change to a material's delivery-control policy.</summary>
public sealed class MaterialTechnicalAcceptancePolicyEvent
{
    public long Id { get; set; }
    public int MaterialId { get; set; }
    public Material Material { get; set; } = null!;
    public bool PreviousRequired { get; set; }
    public bool Required { get; set; }
    public int ChangedByUserId { get; set; }
    public User ChangedByUser { get; set; } = null!;
    public DateTime ChangedAt { get; set; }
}
