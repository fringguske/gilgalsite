namespace ConstructionMS.Domain.Entities;

public class Material
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string Unit { get; set; } = string.Empty;
    public decimal StandardPrice { get; set; }
    public decimal ReorderLevel { get; set; }
    /// <summary>
    /// Determines whether future purchase-order lines for this material require an
    /// assigned Engineer to accept the delivered specification before Finance match.
    /// </summary>
    public bool RequiresTechnicalAcceptance { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
