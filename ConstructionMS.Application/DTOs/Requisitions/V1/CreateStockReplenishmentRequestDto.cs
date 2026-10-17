namespace ConstructionMS.Application.DTOs.Requisitions.V1;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Creates a controlled bulk purchase request for a project store.</summary>
public sealed class CreateStockReplenishmentRequestDto
{
    [Range(1, int.MaxValue)]
    public int ProjectId { get; set; }

    [Range(1, int.MaxValue)]
    public int MaterialId { get; set; }

    [Range(1, int.MaxValue)]
    public int CostCodeId { get; set; }

    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal Quantity { get; set; }

    public DateOnly NeededByDate { get; set; }

    [Required]
    [StringLength(500, MinimumLength = 3)]
    public string Reason { get; set; } = string.Empty;

    [StringLength(1_000)]
    public string? Notes { get; set; }
}
