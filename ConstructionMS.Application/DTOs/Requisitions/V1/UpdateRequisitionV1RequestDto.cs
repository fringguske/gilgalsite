namespace ConstructionMS.Application.DTOs.Requisitions.V1;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>
/// Fields the original foreman may revise before a successful technical check.
/// Actor identity is taken from authentication, never from this body.
/// </summary>
public sealed class UpdateRequisitionV1RequestDto
{
    [Range(1, int.MaxValue)]
    public int CostCodeId { get; set; }

    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal Quantity { get; set; }

    public DateOnly NeededByDate { get; set; }

    [Required]
    [StringLength(500, MinimumLength = 3)]
    public string Purpose { get; set; } = string.Empty;

    [StringLength(1_000)]
    public string? Notes { get; set; }

    /// <summary>Revision last read by the client; prevents overwriting a newer action.</summary>
    [Range(1, int.MaxValue)]
    public int ExpectedRevision { get; set; }
}
