namespace ConstructionMS.Domain.Entities;

/// <summary>
/// An engineer's append-only technical assessment of a material requisition.
/// A new row is written after each foreman revision; prior checks are retained.
/// </summary>
public class EngineerTechnicalCheck
{
    public long Id { get; set; }

    public int RequisitionId { get; set; }
    public Requisition Requisition { get; set; } = null!;

    public int EngineerUserId { get; set; }
    public User EngineerUser { get; set; } = null!;

    /// <summary>Either "Verified" or "RevisionRequired".</summary>
    public string Outcome { get; set; } = string.Empty;

    public string? Comments { get; set; }
    public DateTime CheckedAt { get; set; }

    /// <summary>The requisition revision that this assessment checked.</summary>
    public int RequisitionRevision { get; set; }
}
