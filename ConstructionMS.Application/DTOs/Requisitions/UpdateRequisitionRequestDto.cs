namespace ConstructionMS.Application.DTOs.Requisitions;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Editable fields for a pending requisition.</summary>
public class UpdateRequisitionRequestDto
{
    /// <summary>Updated quantity. Must be > 0.</summary>
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal Quantity { get; set; }

    /// <summary>Updated notes.</summary>
    [StringLength(1_000)]
    public string? Notes { get; set; }
}
