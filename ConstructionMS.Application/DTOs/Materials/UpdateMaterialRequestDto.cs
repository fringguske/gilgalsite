namespace ConstructionMS.Application.DTOs.Materials;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Request body for PUT /api/materials/{id}.</summary>
public class UpdateMaterialRequestDto
{
    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Category { get; set; }

    [Required, StringLength(30)]
    public string Unit { get; set; } = string.Empty;

    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal StandardPrice { get; set; }

    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal ReorderLevel { get; set; }
}
