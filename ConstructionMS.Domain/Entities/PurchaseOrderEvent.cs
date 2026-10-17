namespace ConstructionMS.Domain.Entities;

/// <summary>
/// Append-only evidence of a purchase order's workflow. Existing events must never be updated.
/// </summary>
public class PurchaseOrderEvent
{
    public long Id { get; set; }

    public int PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;

    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;

    public string ActorRole { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? DetailsJson { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}
