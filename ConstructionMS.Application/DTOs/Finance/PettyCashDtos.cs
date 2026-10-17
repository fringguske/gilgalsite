namespace ConstructionMS.Application.DTOs.Finance;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class CreatePettyCashRequestDto
{
    [Range(1, int.MaxValue)] public int ProjectId { get; set; }
    [Range(1, int.MaxValue)] public int CostCodeId { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string Purpose { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.01", "100000")]
    [DecimalPrecision(18, 2)] public decimal Amount { get; set; }
    public DateOnly NeededByDate { get; set; }
}

public sealed class DecidePettyCashRequestDto
{
    public bool Approve { get; set; }
    [Range(typeof(decimal), "0.01", "100000")]
    [DecimalPrecision(18, 2)] public decimal? AmountApproved { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class DisbursePettyCashRequestDto
{
    [Range(1, long.MaxValue)] public long? CashAccountId { get; set; }
    [Required, StringLength(30)] public string Method { get; set; } = string.Empty;
    [Required, StringLength(100, MinimumLength = 3)] public string ExternalReference { get; set; } = string.Empty;
    [Required, StringLength(150, MinimumLength = 3)] public string RecipientName { get; set; } = string.Empty;
    [Required, StringLength(500, MinimumLength = 3)] public string RecipientAcknowledgementReference { get; set; } = string.Empty;
    [Required, StringLength(500, MinimumLength = 3)] public string EvidenceReference { get; set; } = string.Empty;
}

public sealed class ConfirmPettyCashReceiptDto
{
    [Range(typeof(decimal), "0.01", "100000")]
    [DecimalPrecision(18, 2)] public decimal AmountReceived { get; set; }
    [StringLength(500)] public string? Notes { get; set; }
}

public sealed class SubmitPettyCashReconciliationDto
{
    [Range(typeof(decimal), "0", "100000")]
    [DecimalPrecision(18, 2)] public decimal AmountSpent { get; set; }
    [Range(typeof(decimal), "0", "100000")]
    [DecimalPrecision(18, 2)] public decimal AmountReturned { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string EvidenceReference { get; set; } = string.Empty;
    [StringLength(100)] public string? ReturnReference { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class ReviewPettyCashReconciliationDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class PettyCashRequestResponseDto
{
    public long Id { get; set; }
    public string RequestNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int CostCodeId { get; set; }
    public string CostCode { get; set; } = string.Empty;
    public string CostCodeName { get; set; } = string.Empty;
    public string Purpose { get; set; } = string.Empty;
    public decimal AmountRequested { get; set; }
    public decimal? AmountApproved { get; set; }
    public decimal? AmountCommitted { get; set; }
    public DateOnly NeededByDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string RequestedByName { get; set; } = string.Empty;
    public int RequestedByUserId { get; set; }
    public DateTime RequestedAt { get; set; }
    public int? FinanceApprovedByUserId { get; set; }
    public string? FinanceApprovedByName { get; set; }
    public DateTime? FinanceDecisionAt { get; set; }
    public string? FinanceDecisionNotes { get; set; }
    public PettyCashDisbursementResponseDto? Disbursement { get; set; }
    public PettyCashReceiptConfirmationResponseDto? ReceiptConfirmation { get; set; }
    public PettyCashReconciliationResponseDto? LatestReconciliation { get; set; }
}

public sealed class PettyCashDisbursementResponseDto
{
    public long Id { get; set; }
    public string DisbursementNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Method { get; set; } = string.Empty;
    public string ExternalReference { get; set; } = string.Empty;
    public string RecipientName { get; set; } = string.Empty;
    public string RecipientAcknowledgementReference { get; set; } = string.Empty;
    public string EvidenceReference { get; set; } = string.Empty;
    public int DisbursedByUserId { get; set; }
    public string DisbursedByName { get; set; } = string.Empty;
    public DateTime DisbursedAt { get; set; }
}

public sealed class PettyCashReceiptConfirmationResponseDto
{
    public long Id { get; set; }
    public string ConfirmationNumber { get; set; } = string.Empty;
    public decimal AmountReceived { get; set; }
    public string? Notes { get; set; }
    public int ConfirmedByUserId { get; set; }
    public string ConfirmedByName { get; set; } = string.Empty;
    public DateTime ConfirmedAt { get; set; }
}

public sealed class PettyCashReconciliationResponseDto
{
    public long Id { get; set; }
    public string ReconciliationNumber { get; set; } = string.Empty;
    public decimal AmountSpent { get; set; }
    public decimal AmountReturned { get; set; }
    public decimal AmountUnaccounted { get; set; }
    public decimal? AmountExpensed { get; set; }
    public string EvidenceReference { get; set; } = string.Empty;
    public string? ReturnReference { get; set; }
    public string? Notes { get; set; }
    public string SubmittedByName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ReviewedByName { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
}
