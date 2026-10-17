namespace ConstructionMS.Domain.Entities;

/// <summary>Canonical states for the material requisition workflow.</summary>
public static class RequisitionWorkflowStates
{
    public const string AwaitingTechnicalCheck = "AwaitingTechnicalCheck";
    public const string AwaitingSupervisorDecision = "AwaitingSupervisorDecision";
    public const string ReturnedForRevision = "ReturnedForRevision";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        AwaitingTechnicalCheck,
        AwaitingSupervisorDecision,
        ReturnedForRevision,
        Approved,
        Rejected
    };
}
