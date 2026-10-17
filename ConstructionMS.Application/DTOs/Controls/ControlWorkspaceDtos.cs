namespace ConstructionMS.Application.DTOs.Controls;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class OpeningInventoryLineRequestDto
{
    [Range(1, int.MaxValue)] public int MaterialId { get; set; }
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)] public decimal? UnitCost { get; set; }
}

public sealed class OpeningCashLineRequestDto
{
    [Required, StringLength(100, MinimumLength = 2)] public string AccountName { get; set; } = string.Empty;
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)] public decimal Amount { get; set; }
}

public sealed class CreateOpeningPositionRequestDto
{
    [Range(1, int.MaxValue)] public int ProjectId { get; set; }
    [Required, StringLength(20)] public string PositionType { get; set; } = string.Empty;
    public DateOnly AsOfDate { get; set; }
    [StringLength(1_000)] public string? Notes { get; set; }
    [StringLength(500)] public string? EvidenceReference { get; set; }
    public IReadOnlyList<OpeningInventoryLineRequestDto> InventoryLines { get; set; } = [];
    public IReadOnlyList<OpeningCashLineRequestDto> CashLines { get; set; } = [];
}

public sealed class OpeningPositionDecisionRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class OpeningInventoryLineResponseDto
{
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal? UnitCost { get; set; }
}

public sealed class OpeningCashLineResponseDto
{
    public string AccountName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public sealed class CashAccountResponseDto
{
    public long Id { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class OpeningPositionResponseDto
{
    public long Id { get; set; }
    public string BatchNumber { get; set; } = string.Empty;
    public string PositionType { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public DateOnly AsOfDate { get; set; }
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = string.Empty;
    public string SubmittedByName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public string? VerifiedByName { get; set; }
    public string? VerificationNotes { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? DecidedByName { get; set; }
    public string? DecisionNotes { get; set; }
    public DateTime? DecidedAt { get; set; }
    public IReadOnlyList<OpeningInventoryLineResponseDto> InventoryLines { get; set; } = [];
    public IReadOnlyList<OpeningCashLineResponseDto> CashLines { get; set; } = [];
}

public sealed class CreateMaterialReturnRequestDto
{
    [Range(1, long.MaxValue)] public long MaterialIssueId { get; set; }
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [Required, StringLength(30)] public string Condition { get; set; } = string.Empty;
    [StringLength(1_000)] public string? Notes { get; set; }
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class ResolveMaterialIssueDisputeRequestDto
{
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class MaterialIssueDisputeResolutionResponseDto
{
    public long Id { get; set; }
    public string ResolutionNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string MaterialName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal IssuedQuantity { get; set; }
    public decimal ForemanReceivedQuantity { get; set; }
    public decimal ReturnedToStoreQuantity { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string ResolvedByName { get; set; } = string.Empty;
    public DateTime ResolvedAt { get; set; }
}

public sealed class ReceiveMaterialReturnRequestDto
{
    public bool Accept { get; set; }
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal QuantityAccepted { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class MaterialReturnResponseDto
{
    public long Id { get; set; }
    public string ReturnNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string MaterialName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal QuantityOffered { get; set; }
    public decimal? QuantityAccepted { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string ReturnedByName { get; set; } = string.Empty;
    public DateTime ReturnedAt { get; set; }
    public string? ReceivedByName { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
}

public sealed class SubmitCustodyCloseoutRequestDto
{
    [Range(1, long.MaxValue)] public long MaterialIssueId { get; set; }
    [StringLength(1_000)] public string? Notes { get; set; }
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class ReviewCustodyCloseoutRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class CustodyCloseoutResponseDto
{
    public long Id { get; set; }
    public string CloseoutNumber { get; set; } = string.Empty;
    public long MaterialIssueId { get; set; }
    public int Revision { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string MaterialName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal ConfirmedQuantity { get; set; }
    public decimal UsedQuantity { get; set; }
    public decimal WastedQuantity { get; set; }
    public decimal ReturnedQuantity { get; set; }
    public decimal UnaccountedQuantity { get; set; }
    public string Status { get; set; } = string.Empty;
    public string SubmittedByName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public string? Notes { get; set; }
    public string? EvidenceReference { get; set; }
    public string? DecidedByName { get; set; }
    public string? DecisionNotes { get; set; }
    public DateTime? DecidedAt { get; set; }
}

public sealed class CreateOperationalPeriodRequestDto
{
    [Range(1, int.MaxValue)] public int ProjectId { get; set; }
    [Required, StringLength(20)] public string Scope { get; set; } = string.Empty;
    [Required, StringLength(100, MinimumLength = 2)] public string Name { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}

public sealed class PeriodActionRequestDto
{
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class PeriodDecisionRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class OperationalPeriodResponseDto
{
    public long Id { get; set; }
    public string PeriodNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string Scope { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string CreatedByName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string? LatestEventType { get; set; }
    public string? LatestEventNotes { get; set; }
    public string? LatestActorName { get; set; }
    public DateTime? LatestEventAt { get; set; }
}

public sealed class CreateControlledCorrectionRequestDto
{
    [Range(1, long.MaxValue)] public long OperationalPeriodId { get; set; }
    [Required, StringLength(20)] public string CorrectionType { get; set; } = string.Empty;
    [Range(1, int.MaxValue)] public int? MaterialId { get; set; }
    [StringLength(100)] public string? CashAccountName { get; set; }
    [Range(typeof(decimal), "-999999999999999.999", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal QuantityDelta { get; set; }
    [Range(typeof(decimal), "-9999999999999999.99", "9999999999999999.99")]
    [DecimalPrecision(18, 2)] public decimal AmountDelta { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Reason { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class CorrectionDecisionRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class ControlledCorrectionResponseDto
{
    public long Id { get; set; }
    public string CorrectionNumber { get; set; } = string.Empty;
    public long OperationalPeriodId { get; set; }
    public string PeriodName { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string CorrectionType { get; set; } = string.Empty;
    public int? MaterialId { get; set; }
    public string? MaterialName { get; set; }
    public string? Unit { get; set; }
    public string? CashAccountName { get; set; }
    public decimal QuantityDelta { get; set; }
    public decimal AmountDelta { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string Status { get; set; } = string.Empty;
    public string SubmittedByName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public string? DecidedByName { get; set; }
    public string? DecisionNotes { get; set; }
    public DateTime? DecidedAt { get; set; }
}
