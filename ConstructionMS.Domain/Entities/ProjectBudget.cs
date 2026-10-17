namespace ConstructionMS.Domain.Entities;

/// <summary>
/// An immutable approved budget revision. A new row supersedes the previous
/// revision; historical approvals are never updated or deleted.
/// </summary>
public class ProjectBudget
{
    public int Id { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public decimal ApprovedAmount { get; set; }

    public int? ApprovedByUserId { get; set; }
    public User? ApprovedByUser { get; set; }

    /// <summary>CEOApproval for normal revisions; LegacyImport for the migration baseline.</summary>
    public string ApprovalSource { get; set; } = "CEOApproval";

    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ProjectBudgetAllocation> Allocations { get; set; } = [];
}
