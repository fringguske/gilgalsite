namespace ConstructionMS.Domain.Entities;

/// <summary>
/// Append-only evidence for every accepted requisition workflow command.
/// Hash chaining makes deletion, insertion, or alteration detectable during audit.
/// </summary>
public class RequisitionApprovalEvent
{
    public long Id { get; set; }

    public int RequisitionId { get; set; }
    public Requisition Requisition { get; set; } = null!;

    public int SequenceNumber { get; set; }
    public string EventType { get; set; } = string.Empty;

    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;
    public string ActorRole { get; set; } = string.Empty;

    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public string? Comments { get; set; }
    public string EventDataJson { get; set; } = "{}";
    public DateTime OccurredAt { get; set; }

    public string? PreviousEventHash { get; set; }
    public string EventHash { get; set; } = string.Empty;
}
