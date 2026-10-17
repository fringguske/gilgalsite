namespace ConstructionMS.Domain.Entities;

public static class PurchaseOrderWorkflowStates
{
    public const string Draft = "Draft";
    public const string Submitted = "Submitted";
    public const string Approved = "Approved";
    public const string Issued = "Issued";
    public const string Rejected = "Rejected";
    public const string Cancelled = "Cancelled";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Draft,
        Submitted,
        Approved,
        Issued,
        Rejected,
        Cancelled
    };

    public static readonly IReadOnlySet<string> Live = new HashSet<string>(StringComparer.Ordinal)
    {
        Draft,
        Submitted,
        Approved,
        Issued
    };
}

public static class SourcingRoundWorkflowStates
{
    public const string Open = "Open";
    public const string Awarded = "Awarded";
    public const string Closed = "Closed";
    public const string Cancelled = "Cancelled";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        Open,
        Awarded,
        Closed,
        Cancelled
    };
}
