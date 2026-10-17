namespace ConstructionMS.Application.DTOs.Materials;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Request body for POST /api/materials.</summary>
public class CreateMaterialRequestDto
{
    /// <summary>Material name, e.g. "Portland Cement 50kg". Required.</summary>
    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional grouping category, e.g. "Structural" or "Electrical".</summary>
    [StringLength(100)]
    public string? Category { get; set; }

    /// <summary>Unit of measurement, e.g. "bags", "litres", "m³". Required.</summary>
    [Required, StringLength(30)]
    public string Unit { get; set; } = string.Empty;

    /// <summary>Standard/reference price per unit in KES.</summary>
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal StandardPrice { get; set; }

    /// <summary>Quantity below which a reorder alert should be raised.</summary>
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal ReorderLevel { get; set; }
}
