namespace ConstructionMS.Domain.Entities;

/// <summary>
/// An append-only engineer verification of physical project progress.
/// Corrections are represented by a later verification, preserving history.
/// </summary>
public class ProjectProgressVerification
{
    public int Id { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public decimal PercentageComplete { get; set; }
    public string WorkSummary { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }

    public int VerifiedByUserId { get; set; }
    public User VerifiedByUser { get; set; } = null!;

    public DateTime VerifiedAt { get; set; } = DateTime.UtcNow;
}
