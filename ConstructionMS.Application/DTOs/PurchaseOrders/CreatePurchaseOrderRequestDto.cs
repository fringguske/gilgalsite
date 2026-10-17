namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

/// <summary>
/// Creates a draft PO. Material, quantity and unit price are derived on the server from
/// the approved requisition and selected supplier quote.
/// </summary>
public sealed class CreatePurchaseOrderRequestDto
{
    [Range(1, int.MaxValue)]
    public int RequisitionId { get; set; }

    [Range(1, int.MaxValue)]
    public int SupplierQuoteId { get; set; }

    [Required]
    public DateOnly? ExpectedDeliveryDate { get; set; }

    [StringLength(300)]
    public string? DeliveryLocation { get; set; }

    [StringLength(1_000)]
    public string? Notes { get; set; }
}
