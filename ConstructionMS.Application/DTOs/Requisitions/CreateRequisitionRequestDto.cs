namespace ConstructionMS.Application.DTOs.Requisitions;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Request body for creating a material requisition.</summary>
public class CreateRequisitionRequestDto
{
    /// <summary>Which construction site this material is needed at. Required.</summary>
    [Range(1, int.MaxValue)]
    public int ProjectId { get; set; }

    /// <summary>The specific material being requested. Required.</summary>
    [Range(1, int.MaxValue)]
    public int MaterialId { get; set; }

    /// <summary>Number of units required. Must be > 0.</summary>
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal Quantity { get; set; }

    /// <summary>The requester, who cannot approve the same requisition.</summary>
    [Range(1, int.MaxValue)]
    public int RequestedByUserId { get; set; }

    /// <summary>Optional notes explaining urgency, site location, intended use, etc.</summary>
    [StringLength(1_000)]
    public string? Notes { get; set; }
}
