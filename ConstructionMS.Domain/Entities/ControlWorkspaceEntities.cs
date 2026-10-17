namespace ConstructionMS.Domain.Entities;

public static class OpeningPositionTypes
{
    public const string Inventory = "Inventory";
    public const string Cash = "Cash";
}

public static class OpeningPositionStatuses
{
    public const string AwaitingVerification = "AwaitingVerification";
    public const string AwaitingApproval = "AwaitingApproval";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>Controlled source for quantities or cash that existed before the system cut-over.</summary>
public sealed class OpeningPositionBatch
{
    public long Id { get; set; }
    public string BatchNumber { get; set; } = string.Empty;
    public string PositionType { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public DateOnly AsOfDate { get; set; }
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = OpeningPositionStatuses.AwaitingApproval;
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; }
    public ICollection<OpeningInventoryLine> InventoryLines { get; set; } = [];
    public ICollection<OpeningCashLine> CashLines { get; set; } = [];
    public OpeningPositionVerification? Verification { get; set; }
    public OpeningPositionDecision? Decision { get; set; }
    public OpeningPositionPosting? Posting { get; set; }
}

/// <summary>Independent, append-only Supervisor verification of opening stock.</summary>
public sealed class OpeningPositionVerification
{
    public long Id { get; set; }
    public long OpeningPositionBatchId { get; set; }
    public OpeningPositionBatch OpeningPositionBatch { get; set; } = null!;
    public string Outcome { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int VerifiedByUserId { get; set; }
    public User VerifiedByUser { get; set; } = null!;
    public DateTime VerifiedAt { get; set; }
}

/// <summary>Immutable material line belonging to an opening-position batch.</summary>
public sealed class OpeningInventoryLine
{
    public long Id { get; set; }
    public long OpeningPositionBatchId { get; set; }
    public OpeningPositionBatch OpeningPositionBatch { get; set; } = null!;
    public int MaterialId { get; set; }
    public Material Material { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal? UnitCost { get; set; }
}

/// <summary>Immutable cash-account line belonging to an opening-position batch.</summary>
public sealed class OpeningCashLine
{
    public long Id { get; set; }
    public long OpeningPositionBatchId { get; set; }
    public OpeningPositionBatch OpeningPositionBatch { get; set; } = null!;
    public string AccountName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

/// <summary>Independent, append-only CEO decision on an opening position.</summary>
public sealed class OpeningPositionDecision
{
    public long Id { get; set; }
    public long OpeningPositionBatchId { get; set; }
    public OpeningPositionBatch OpeningPositionBatch { get; set; } = null!;
    public string Outcome { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int DecidedByUserId { get; set; }
    public User DecidedByUser { get; set; } = null!;
    public DateTime DecidedAt { get; set; }
}

/// <summary>Append-only evidence that an approved opening batch was posted.</summary>
public sealed class OpeningPositionPosting
{
    public long Id { get; set; }
    public long OpeningPositionBatchId { get; set; }
    public OpeningPositionBatch OpeningPositionBatch { get; set; } = null!;
    public int PostedByUserId { get; set; }
    public User PostedByUser { get; set; } = null!;
    public DateTime PostedAt { get; set; }
}

public static class MaterialReturnStatuses
{
    public const string AwaitingReceipt = "AwaitingReceipt";
    public const string Received = "Received";
    public const string Rejected = "Rejected";
}

/// <summary>Append-only Supervisor resolution of a quantity disputed at handover.</summary>
public sealed class MaterialIssueDisputeResolution
{
    public long Id { get; set; }
    public string ResolutionNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public MaterialIssue MaterialIssue { get; set; } = null!;
    public decimal IssuedQuantity { get; set; }
    public decimal ForemanReceivedQuantity { get; set; }
    public decimal ReturnedToStoreQuantity { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public int ResolvedByUserId { get; set; }
    public User ResolvedByUser { get; set; } = null!;
    public DateTime ResolvedAt { get; set; }
}

/// <summary>Controlled return of unused material from Foreman custody to Stores.</summary>
public sealed class MaterialReturn
{
    public long Id { get; set; }
    public string ReturnNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public MaterialIssue MaterialIssue { get; set; } = null!;
    public decimal QuantityOffered { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = MaterialReturnStatuses.AwaitingReceipt;
    public int ReturnedByUserId { get; set; }
    public User ReturnedByUser { get; set; } = null!;
    public DateTime ReturnedAt { get; set; }
    public decimal? QuantityAccepted { get; set; }
    public int? ReceivedByUserId { get; set; }
    public User? ReceivedByUser { get; set; }
    public string? ReceiptNotes { get; set; }
    public string? ReceiptEvidenceReference { get; set; }
    public DateTime? ReceivedAt { get; set; }
}

public static class CustodyCloseoutStatuses
{
    public const string AwaitingReview = "AwaitingReview";
    public const string Approved = "Approved";
    public const string Returned = "Returned";
}

/// <summary>Immutable quantity snapshot submitted when a Foreman accounts for an issue.</summary>
public sealed class MaterialCustodyCloseout
{
    public long Id { get; set; }
    public string CloseoutNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public MaterialIssue MaterialIssue { get; set; } = null!;
    public int Revision { get; set; }
    public decimal ConfirmedQuantity { get; set; }
    public decimal UsedQuantity { get; set; }
    public decimal WastedQuantity { get; set; }
    public decimal ReturnedQuantity { get; set; }
    public decimal UnaccountedQuantity { get; set; }
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = CustodyCloseoutStatuses.AwaitingReview;
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; }
    public MaterialCustodyCloseoutDecision? Decision { get; set; }
}

/// <summary>Append-only Supervisor decision on one custody close-out revision.</summary>
public sealed class MaterialCustodyCloseoutDecision
{
    public long Id { get; set; }
    public long MaterialCustodyCloseoutId { get; set; }
    public MaterialCustodyCloseout MaterialCustodyCloseout { get; set; } = null!;
    public string Outcome { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int DecidedByUserId { get; set; }
    public User DecidedByUser { get; set; } = null!;
    public DateTime DecidedAt { get; set; }
}

public static class OperationalPeriodScopes
{
    public const string Inventory = "Inventory";
    public const string Finance = "Finance";
}

public static class OperationalPeriodStatuses
{
    public const string Open = "Open";
    public const string AwaitingClose = "AwaitingClose";
    public const string Closed = "Closed";
    public const string Returned = "Returned";
}

/// <summary>Project and scope boundary used to lock completed operational records.</summary>
public sealed class OperationalPeriod
{
    public long Id { get; set; }
    public string PeriodNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Scope { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string Status { get; set; } = OperationalPeriodStatuses.Open;
    public int CreatedByUserId { get; set; }
    public User CreatedByUser { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public ICollection<OperationalPeriodEvent> Events { get; set; } = [];
}

/// <summary>Append-only history for period submission and CEO decisions.</summary>
public sealed class OperationalPeriodEvent
{
    public long Id { get; set; }
    public long OperationalPeriodId { get; set; }
    public OperationalPeriod OperationalPeriod { get; set; } = null!;
    public int SequenceNumber { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;
    public string ActorRole { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; }
}

public static class ControlledCorrectionTypes
{
    public const string Inventory = "Inventory";
    public const string Finance = "Finance";
}

public static class ControlledCorrectionStatuses
{
    public const string AwaitingApproval = "AwaitingApproval";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>Immutable correction request against a closed period; approval creates a new posting.</summary>
public sealed class ControlledCorrection
{
    public long Id { get; set; }
    public string CorrectionNumber { get; set; } = string.Empty;
    public long OperationalPeriodId { get; set; }
    public OperationalPeriod OperationalPeriod { get; set; } = null!;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string CorrectionType { get; set; } = string.Empty;
    public int? MaterialId { get; set; }
    public Material? Material { get; set; }
    public string? CashAccountName { get; set; }
    public decimal QuantityDelta { get; set; }
    public decimal AmountDelta { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = ControlledCorrectionStatuses.AwaitingApproval;
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; }
    public ControlledCorrectionDecision? Decision { get; set; }
}

/// <summary>Independent, append-only CEO decision on a controlled correction.</summary>
public sealed class ControlledCorrectionDecision
{
    public long Id { get; set; }
    public long ControlledCorrectionId { get; set; }
    public ControlledCorrection ControlledCorrection { get; set; } = null!;
    public string Outcome { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public int DecidedByUserId { get; set; }
    public User DecidedByUser { get; set; } = null!;
    public DateTime DecidedAt { get; set; }
}

/// <summary>Current balance projection for one project cash account.</summary>
public sealed class CashAccount
{
    public long Id { get; set; }
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Append-only proof of every controlled cash-account balance change.</summary>
public sealed class CashLedgerEntry
{
    public long Id { get; set; }
    public string EntryNumber { get; set; } = string.Empty;
    public long CashAccountId { get; set; }
    public CashAccount CashAccount { get; set; } = null!;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public decimal AmountDelta { get; set; }
    public decimal BalanceAfter { get; set; }
    public string EntryType { get; set; } = string.Empty;
    public string ReferenceType { get; set; } = string.Empty;
    public long ReferenceId { get; set; }
    public string ReferenceNumber { get; set; } = string.Empty;
    public int PostedByUserId { get; set; }
    public User PostedByUser { get; set; } = null!;
    public DateTime PostedAt { get; set; }
    public string? Notes { get; set; }
}
