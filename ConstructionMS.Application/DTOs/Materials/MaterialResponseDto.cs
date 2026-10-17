namespace ConstructionMS.Application.DTOs.Materials;

/// <summary>Material catalogue response.</summary>
public class MaterialResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Grouping category, e.g. "Structural", "Finishing", "Plumbing". Optional.</summary>
    public string? Category { get; set; }

    /// <summary>Unit of measurement, e.g. "bags", "kg", "m²", "pieces".</summary>
    public string Unit { get; set; } = string.Empty;

    /// <summary>Reference price per unit used for PO budget estimates and 3-way match.</summary>
    public decimal StandardPrice { get; set; }

    /// <summary>Minimum stock quantity used to identify low stock.</summary>
    public decimal ReorderLevel { get; set; }

    /// <summary>Whether new PO deliveries require an Engineer's technical decision.</summary>
    public bool RequiresTechnicalAcceptance { get; set; }

    public DateTime CreatedAt { get; set; }
}
