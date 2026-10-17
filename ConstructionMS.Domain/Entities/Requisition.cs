namespace ConstructionMS.Domain.Entities;

public static class RequisitionTypes
{
    public const string SiteUse = "SiteUse";
    public const string StockReplenishment = "StockReplenishment";
}

public class Requisition
{
    public int Id { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public int MaterialId { get; set; }
    public Material Material { get; set; } = null!;

    public int CostCodeId { get; set; }
    public CostCode CostCode { get; set; } = null!;

    /// <summary>
    /// SiteUse is handed to a foreman after approval. StockReplenishment is received
    /// into the project store and must never be issued as one bulk foreman handover.
    /// </summary>
    public string RequestType { get; set; } = RequisitionTypes.SiteUse;

    public decimal Quantity { get; set; }

    /// <summary>The date by which the material is required at the project.</summary>
    public DateOnly NeededByDate { get; set; }

    /// <summary>The specific construction activity for which the material is required.</summary>
    public string Purpose { get; set; } = string.Empty;

    public int RequestedByUserId { get; set; }
    public User RequestedByUser { get; set; } = null!;

    public int? ApprovedByUserId { get; set; }
    public User? ApprovedByUser { get; set; }

    public string Status { get; set; } = RequisitionWorkflowStates.AwaitingTechnicalCheck;
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ApprovedAt { get; set; }

    /// <summary>
    /// Optimistic workflow version. Every accepted command increments it and creates
    /// exactly one <see cref="RequisitionApprovalEvent"/> with the same sequence.
    /// </summary>
    public int WorkflowRevision { get; set; }

    public ICollection<EngineerTechnicalCheck> TechnicalChecks { get; set; } = [];
    public ICollection<RequisitionApprovalEvent> ApprovalEvents { get; set; } = [];
}
