namespace ConstructionMS.Application.DTOs.Finance;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class CreateSupplierInvoiceRequestDto
{
    [Range(1, int.MaxValue)] public int PurchaseOrderId { get; set; }
    [Required, StringLength(100)] public string InvoiceNumber { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [Range(typeof(decimal), "0.01", "9999999999999999.99")]
    [DecimalPrecision(18, 2)] public decimal UnitPrice { get; set; }
    [Range(typeof(decimal), "0.01", "9999999999999999.99")]
    [DecimalPrecision(18, 2)] public decimal Amount { get; set; }
    [StringLength(500)] public string? DocumentReference { get; set; }
}

public sealed class ReviewInvoiceRequestDto
{
    [StringLength(1_000)] public string? Notes { get; set; }
}

public sealed class CeoInvoiceDecisionRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class AuthorizePaymentRequestDto
{
    [StringLength(1_000)] public string? Notes { get; set; }
}

public sealed class ExecutePaymentRequestDto
{
    [Range(1, long.MaxValue)] public long? CashAccountId { get; set; }
    [Required, StringLength(30)] public string Method { get; set; } = string.Empty;
    [Required, StringLength(100)] public string ExternalReference { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class SupplierInvoiceResponseDto
{
    public long Id { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int PurchaseOrderId { get; set; }
    public string PurchaseOrderNumber { get; set; } = string.Empty;
    public int RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal OrderedQuantity { get; set; }
    public decimal OrderedUnitPrice { get; set; }
    public decimal AcceptedQuantity { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Amount { get; set; }
    public string? DocumentReference { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool QuantityMatches { get; set; }
    public bool PriceMatches { get; set; }
    public bool AmountMatches { get; set; }
    public bool RequiresTechnicalAcceptance { get; set; }
    public string TechnicalAcceptanceStatus { get; set; } = "NotRequired";
    public int TechnicalAcceptanceRequiredCount { get; set; }
    public int TechnicalAcceptanceAcceptedCount { get; set; }
    public int TechnicalAcceptanceRejectedCount { get; set; }
    public string? LatestTechnicalReviewerName { get; set; }
    public DateTime? LatestTechnicalReviewAt { get; set; }
    public bool RequiresCeoApproval { get; set; }
    public string? MatchNotes { get; set; }
    public string CapturedByName { get; set; } = string.Empty;
    public DateTime CapturedAt { get; set; }
    public int? ReviewedByUserId { get; set; }
    public string? ReviewedByName { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? CeoDecision { get; set; }
    public string? CeoDecisionNotes { get; set; }
    public DateTime? CeoDecisionAt { get; set; }
    public PaymentAuthorizationResponseDto? Authorization { get; set; }
    public PaymentResponseDto? Payment { get; set; }
}

public sealed class PaymentAuthorizationResponseDto
{
    public long Id { get; set; }
    public string AuthorizationNumber { get; set; } = string.Empty;
    public long SupplierInvoiceId { get; set; }
    public int ProjectId { get; set; }
    public decimal Amount { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public int AuthorizedByUserId { get; set; }
    public string AuthorizedByName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime AuthorizedAt { get; set; }
    public bool IsPaid { get; set; }
}

public sealed class PaymentResponseDto
{
    public long Id { get; set; }
    public string PaymentNumber { get; set; } = string.Empty;
    public string DisplayNumber { get; set; } = string.Empty;
    public long PaymentAuthorizationId { get; set; }
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string PaidByName { get; set; } = string.Empty;
    public DateTime PaidAt { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
}

public sealed class CashBookResponseDto
{
    public DateTime GeneratedAt { get; set; }
    public IReadOnlyList<CashBookProjectResponseDto> Projects { get; set; } = [];
}

public sealed class CashBookProjectResponseDto
{
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public decimal AllocatedBudget { get; set; }
    public decimal SupplierPayments { get; set; }
    public decimal PettyCashSpent { get; set; }
    public decimal OpenCommitments { get; set; }
    public decimal CashAwaitingAccountability { get; set; }
    public decimal TotalUsed { get; set; }
    public decimal BudgetAvailable { get; set; }
    public int EntryCount { get; set; }
    public IReadOnlyList<CashBookEntryResponseDto> RecentEntries { get; set; } = [];
}

public sealed class CashBookEntryResponseDto
{
    public string EntryType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Detail { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string State { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; }
}

public sealed class ControlEventResponseDto
{
    public string ChainKey { get; set; } = string.Empty;
    public int SequenceNumber { get; set; }
    public int? RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public long EntityId { get; set; }
    public string ReferenceNumber { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
    public string? MaterialName { get; set; }
    public string? MaterialUnit { get; set; }
    public decimal? RequestedQuantity { get; set; }
    public decimal? EventQuantity { get; set; }
    public string? DetailsJson { get; set; }
    public DateTime OccurredAt { get; set; }
    public string EventHash { get; set; } = string.Empty;
}
