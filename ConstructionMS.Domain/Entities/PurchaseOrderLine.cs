namespace ConstructionMS.Domain.Entities;

/// <summary>A server-derived purchase-order line linked back to its source requisition.</summary>
public class PurchaseOrderLine
{
    public int Id { get; set; }

    public int PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;

    public int RequisitionId { get; set; }
    public Requisition Requisition { get; set; } = null!;

    public int MaterialId { get; set; }
    public Material Material { get; set; } = null!;

    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>
    /// Immutable snapshot of the material catalogue rule when this order was raised.
    /// </summary>
    public bool RequiresTechnicalAcceptance { get; set; } = true;
}
