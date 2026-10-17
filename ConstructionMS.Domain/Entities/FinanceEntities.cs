namespace ConstructionMS.Domain.Entities;

public static class InvoiceStatuses
{
    public const string PendingReview = "PendingReview";
    public const string Matched = "Matched";
    public const string Mismatch = "Mismatch";
    public const string AwaitingCeoApproval = "AwaitingCeoApproval";
    public const string ReadyForAuthorization = "ReadyForAuthorization";
    public const string Authorized = "Authorized";
    public const string Paid = "Paid";
    public const string Returned = "Returned";
    public const string Rejected = "Rejected";
}

public static class PettyCashStatuses
{
    public const string PendingFinanceApproval = "PendingFinanceApproval";
    public const string Rejected = "Rejected";
    public const string Approved = "Approved";
    public const string Disbursed = "Disbursed";
    public const string ReconciliationSubmitted = "ReconciliationSubmitted";
    public const string Reconciled = "Reconciled";
}

public static class PettyCashReconciliationStatuses
{
    public const string PendingReview = "PendingReview";
    public const string Approved = "Approved";
    public const string Returned = "Returned";
}

/// <summary>A Supervisor's controlled request for a small, project-scoped site expense.</summary>
public sealed class PettyCashRequest
{
    public long Id { get; set; }
    public string RequestNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public int CostCodeId { get; set; }
    public CostCode CostCode { get; set; } = null!;
    public string Purpose { get; set; } = string.Empty;
    public decimal AmountRequested { get; set; }
    public DateOnly NeededByDate { get; set; }
    public int RequestedByUserId { get; set; }
    public User RequestedByUser { get; set; } = null!;
    public DateTime RequestedAt { get; set; }
    public string Status { get; set; } = PettyCashStatuses.PendingFinanceApproval;
    public decimal? AmountApproved { get; set; }
    public int? FinanceApprovedByUserId { get; set; }
    public User? FinanceApprovedByUser { get; set; }
    public DateTime? FinanceDecisionAt { get; set; }
    public string? FinanceDecisionNotes { get; set; }
    public decimal? AmountCommitted { get; set; }
    public PettyCashDisbursement? Disbursement { get; set; }
    public PettyCashReceiptConfirmation? ReceiptConfirmation { get; set; }
    public ICollection<PettyCashReconciliation> Reconciliations { get; set; } = [];
}

/// <summary>Immutable evidence that Finance handed over one approved petty-cash amount.</summary>
public sealed class PettyCashDisbursement
{
    public long Id { get; set; }
    public string DisbursementNumber { get; set; } = string.Empty;
    public long PettyCashRequestId { get; set; }
    public PettyCashRequest PettyCashRequest { get; set; } = null!;
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientAcknowledgementReference { get; set; } = string.Empty;
    public string EvidenceReference { get; set; } = string.Empty;
    public int DisbursedByUserId { get; set; }
    public User DisbursedByUser { get; set; } = null!;
    public DateTime DisbursedAt { get; set; }
}

/// <summary>Immutable confirmation by the requesting Supervisor that the recorded petty cash was received.</summary>
public sealed class PettyCashReceiptConfirmation
{
    public long Id { get; set; }
    public string ConfirmationNumber { get; set; } = string.Empty;
    public long PettyCashRequestId { get; set; }
    public PettyCashRequest PettyCashRequest { get; set; } = null!;
    public long PettyCashDisbursementId { get; set; }
    public PettyCashDisbursement PettyCashDisbursement { get; set; } = null!;
    public decimal AmountReceived { get; set; }
    public string? Notes { get; set; }
    public int ConfirmedByUserId { get; set; }
    public User ConfirmedByUser { get; set; } = null!;
    public DateTime ConfirmedAt { get; set; }
}

/// <summary>Immutable expenditure evidence with a controlled Finance decision.</summary>
public sealed class PettyCashReconciliation
{
    public long Id { get; set; }
    public string ReconciliationNumber { get; set; } = string.Empty;
    public long PettyCashRequestId { get; set; }
    public PettyCashRequest PettyCashRequest { get; set; } = null!;
    public decimal AmountSpent { get; set; }
    public decimal AmountReturned { get; set; }
    public string EvidenceReference { get; set; } = string.Empty;
    public string? ReturnReference { get; set; }
    public string? Notes { get; set; }
    public int SubmittedByUserId { get; set; }
    public User SubmittedByUser { get; set; } = null!;
    public DateTime SubmittedAt { get; set; }
    public string Status { get; set; } = PettyCashReconciliationStatuses.PendingReview;
    public int? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
    public decimal? AmountExpensed { get; set; }
    public ICollection<PettyCashReconciliationEvent> Events { get; set; } = [];
}

/// <summary>Append-only Finance decision history for each petty-cash reconciliation attempt.</summary>
public sealed class PettyCashReconciliationEvent
{
    public long Id { get; set; }
    public long PettyCashReconciliationId { get; set; }
    public PettyCashReconciliation PettyCashReconciliation { get; set; } = null!;
    public string EventType { get; set; } = string.Empty;
    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;
    public string ActorRole { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; }
}

/// <summary>Immutable supplier invoice source, reviewed against the PO and accepted GRNs.</summary>
public sealed class SupplierInvoice
{
    public long Id { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int PurchaseOrderId { get; set; }
    public PurchaseOrder PurchaseOrder { get; set; } = null!;
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public int SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Amount { get; set; }
    public string? DocumentReference { get; set; }
    public int CapturedByUserId { get; set; }
    public User CapturedByUser { get; set; } = null!;
    public DateTime CapturedAt { get; set; }
    public string Status { get; set; } = InvoiceStatuses.PendingReview;
    public decimal? ReceivedQuantitySnapshot { get; set; }
    public string? MatchNotes { get; set; }
    public int? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public int? CeoDecisionByUserId { get; set; }
    public User? CeoDecisionByUser { get; set; }
    public string? CeoDecision { get; set; }
    public string? CeoDecisionNotes { get; set; }
    public DateTime? CeoDecisionAt { get; set; }
}

/// <summary>Supervisor authority for one Finance-matched, locked invoice amount.</summary>
public sealed class PaymentAuthorization
{
    public long Id { get; set; }
    public string AuthorizationNumber { get; set; } = string.Empty;
    public long SupplierInvoiceId { get; set; }
    public SupplierInvoice SupplierInvoice { get; set; } = null!;
    public decimal Amount { get; set; }
    public int AuthorizedByUserId { get; set; }
    public User AuthorizedByUser { get; set; } = null!;
    public string? Notes { get; set; }
    public DateTime AuthorizedAt { get; set; }
}

/// <summary>Immutable evidence that Finance executed a Supervisor-authorized instruction.</summary>
public sealed class Payment
{
    public long Id { get; set; }
    public string PaymentNumber { get; set; } = string.Empty;
    public long PaymentAuthorizationId { get; set; }
    public PaymentAuthorization PaymentAuthorization { get; set; } = null!;
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public int PaidByUserId { get; set; }
    public User PaidByUser { get; set; } = null!;
    public DateTime PaidAt { get; set; }
    public PaymentReceipt? Receipt { get; set; }
}

/// <summary>System receipt tied one-to-one to an executed payment.</summary>
public sealed class PaymentReceipt
{
    public long Id { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public long PaymentId { get; set; }
    public Payment Payment { get; set; } = null!;
    public decimal Amount { get; set; }
    public int IssuedByUserId { get; set; }
    public User IssuedByUser { get; set; } = null!;
    public DateTime IssuedAt { get; set; }
}

/// <summary>Hash-linked, append-only event used for CEO and Auditor cross-module trace.</summary>
public sealed class ControlEvent
{
    public long Id { get; set; }
    public string ChainKey { get; set; } = string.Empty;
    public int SequenceNumber { get; set; }
    public int? RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string EntityType { get; set; } = string.Empty;
    public long EntityId { get; set; }
    public string ReferenceNumber { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public int ActorUserId { get; set; }
    public User ActorUser { get; set; } = null!;
    public string ActorRole { get; set; } = string.Empty;
    public string? DetailsJson { get; set; }
    public DateTime OccurredAt { get; set; }
    public string? PreviousEventHash { get; set; }
    public string EventHash { get; set; } = string.Empty;
}
