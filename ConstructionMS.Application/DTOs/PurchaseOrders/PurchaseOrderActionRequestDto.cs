namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

/// <summary>Optional, append-only note explaining a workflow action.</summary>
public sealed class PurchaseOrderActionRequestDto
{
    [StringLength(1_000)]
    public string? Notes { get; set; }
}
