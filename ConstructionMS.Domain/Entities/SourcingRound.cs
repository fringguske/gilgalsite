namespace ConstructionMS.Domain.Entities;

/// <summary>
/// A controlled request for supplier quotations against one approved material requisition.
/// </summary>
public class SourcingRound
{
    public int Id { get; set; }

    public int RequisitionId { get; set; }
    public Requisition Requisition { get; set; } = null!;

    public int CreatedByUserId { get; set; }
    public User CreatedByUser { get; set; } = null!;

    public string Status { get; set; } = SourcingRoundWorkflowStates.Open;
    public DateTime? QuoteDueAt { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }

    public ICollection<SupplierQuote> Quotes { get; set; } = [];
    public ICollection<SourcingRoundEvent> Events { get; set; } = [];
}
