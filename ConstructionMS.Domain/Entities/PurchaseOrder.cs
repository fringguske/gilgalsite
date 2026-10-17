namespace ConstructionMS.Domain.Entities;

/// <summary>
/// Purchase commitment created from an approved requisition and independently approved
/// before it can be issued to a supplier.
/// </summary>
public class PurchaseOrder
{
    public int Id { get; set; }
    public string PurchaseOrderNumber { get; set; } = string.Empty;

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public int RequisitionId { get; set; }
    public Requisition Requisition { get; set; } = null!;

    public int SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;

    public int SupplierQuoteId { get; set; }
    public SupplierQuote SupplierQuote { get; set; } = null!;

    public int CreatedByUserId { get; set; }
    public User CreatedByUser { get; set; } = null!;

    public int? ApprovedByUserId { get; set; }
    public User? ApprovedByUser { get; set; }

    public int? IssuedByUserId { get; set; }
    public User? IssuedByUser { get; set; }

    public int? RejectedByUserId { get; set; }
    public User? RejectedByUser { get; set; }

    public int? CancelledByUserId { get; set; }
    public User? CancelledByUser { get; set; }

    public string Status { get; set; } = PurchaseOrderWorkflowStates.Draft;
    public DateOnly? ExpectedDeliveryDate { get; set; }
    public string? DeliveryLocation { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? IssuedAt { get; set; }
    public DateTime? RejectedAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    public ICollection<PurchaseOrderLine> Lines { get; set; } = [];
    public ICollection<PurchaseOrderEvent> Events { get; set; } = [];
    public ICollection<GoodsReceipt> GoodsReceipts { get; set; } = [];
}
