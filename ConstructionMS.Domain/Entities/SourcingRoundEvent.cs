namespace ConstructionMS.Domain.Entities;

/// <summary>Append-only evidence of every sourcing-round status transition.</summary>
public class SourcingRoundEvent
{
    public long Id { get; set; }

    public int SourcingRoundId { get; set; }
    public SourcingRound SourcingRound { get; set; } = null!;

    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;

    public string ActorRole { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}
