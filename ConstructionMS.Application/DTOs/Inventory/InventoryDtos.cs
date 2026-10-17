namespace ConstructionMS.Application.DTOs.Inventory;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class ReceiveGoodsRequestDto
{
    [Range(1, int.MaxValue)] public int PurchaseOrderId { get; set; }
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal DeliveredQuantity { get; set; }
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal AcceptedQuantity { get; set; }
    [Required, StringLength(30)] public string Condition { get; set; } = string.Empty;
    [Required, StringLength(100)] public string DeliveryNoteReference { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
    [StringLength(1_000)] public string? DiscrepancyNotes { get; set; }
}

public sealed class RecordTechnicalAcceptanceRequestDto
{
    [Required, StringLength(20)] public string Outcome { get; set; } = string.Empty;
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class IssueMaterialRequestDto
{
    [Range(1, int.MaxValue)] public int RequisitionId { get; set; }
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [StringLength(1_000)] public string? Notes { get; set; }
}

public sealed class ConfirmMaterialIssueRequestDto
{
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal ReceivedQuantity { get; set; }
    [StringLength(1_000)] public string? Notes { get; set; }
}

public sealed class RecordMaterialUsageRequestDto
{
    [Required, StringLength(20)] public string UsageType { get; set; } = string.Empty;
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string PurposeOrReason { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
    [Required, StringLength(100, MinimumLength = 8)] public string IdempotencyKey { get; set; } = string.Empty;
}

public sealed class CreateStockTransferRequestDto
{
    [Range(1, int.MaxValue)] public int FromProjectId { get; set; }
    [Range(1, int.MaxValue)] public int ToProjectId { get; set; }
    [Range(1, int.MaxValue)] public int MaterialId { get; set; }
    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal Quantity { get; set; }
    [Required, StringLength(500, MinimumLength = 3)] public string Reason { get; set; } = string.Empty;
}

public sealed class ReceiveStockTransferRequestDto
{
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal ReceivedQuantity { get; set; }
    [StringLength(1_000)] public string? Notes { get; set; }
}

public sealed class ResolveStockTransferDisputeRequestDto
{
    [Required, StringLength(30)] public string Disposition { get; set; } = string.Empty;
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
    [StringLength(500)] public string? EvidenceReference { get; set; }
}

public sealed class CreateStockCountRequestDto
{
    [Range(1, int.MaxValue)] public int ProjectId { get; set; }
    [Range(1, int.MaxValue)] public int MaterialId { get; set; }
    [Range(typeof(decimal), "0", "999999999999999.999")]
    [DecimalPrecision(18, 3)] public decimal CountedQuantity { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class ReviewStockCountRequestDto
{
    public bool Approve { get; set; }
    [Required, StringLength(1_000, MinimumLength = 3)] public string Notes { get; set; } = string.Empty;
}

public sealed class GoodsReceiptResponseDto
{
    public long Id { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public int PurchaseOrderId { get; set; }
    public string PurchaseOrderNumber { get; set; } = string.Empty;
    public string SupplierName { get; set; } = string.Empty;
    public int RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal OrderedQuantity { get; set; }
    public decimal DeliveredQuantity { get; set; }
    public decimal AcceptedQuantity { get; set; }
    public decimal RejectedQuantity { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string DeliveryNoteReference { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string? DiscrepancyNotes { get; set; }
    public string ReceivedByName { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    public bool RequiresTechnicalAcceptance { get; set; }
    public string TechnicalAcceptanceStatus { get; set; } = "NotRequired";
    public string? TechnicalAcceptanceReviewedByName { get; set; }
    public DateTime? TechnicalAcceptanceReviewedAt { get; set; }
}

public sealed class TechnicalAcceptanceResponseDto
{
    public long GoodsReceiptId { get; set; }
    public long? TechnicalAcceptanceId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public int PurchaseOrderId { get; set; }
    public string PurchaseOrderNumber { get; set; } = string.Empty;
    public int RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public string SupplierName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal OrderedQuantity { get; set; }
    public decimal DeliveredQuantity { get; set; }
    public decimal AcceptedQuantity { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string DeliveryNoteReference { get; set; } = string.Empty;
    public string? ReceiptEvidenceReference { get; set; }
    public string ReceivedByName { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    public bool RequiresTechnicalAcceptance { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Outcome { get; set; }
    public int? ReviewSequence { get; set; }
    public int? ReviewedByUserId { get; set; }
    public string? ReviewedByName { get; set; }
    public string? Notes { get; set; }
    public string? ReviewEvidenceReference { get; set; }
    public DateTime? ReviewedAt { get; set; }
}

public sealed class StockBalanceResponseDto
{
    public long Id { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal QuantityOnHand { get; set; }
    public decimal ReorderLevel { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class StockLedgerEntryResponseDto
{
    public long Id { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public string MovementType { get; set; } = string.Empty;
    public decimal QuantityDelta { get; set; }
    public decimal BalanceAfter { get; set; }
    public string ReferenceType { get; set; } = string.Empty;
    public long ReferenceId { get; set; }
    public string ReferenceNumber { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime OccurredAt { get; set; }
}

public sealed class MaterialUsageResponseDto
{
    public long Id { get; set; }
    public string UsageType { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string PurposeOrReason { get; set; } = string.Empty;
    public string? EvidenceReference { get; set; }
    public string RecordedByName { get; set; } = string.Empty;
    public DateTime RecordedAt { get; set; }
}

public sealed class MaterialIssueResponseDto
{
    public long Id { get; set; }
    public string IssueNumber { get; set; } = string.Empty;
    public int RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal RequestedQuantity { get; set; }
    public decimal QuantityIssued { get; set; }
    public string Status { get; set; } = string.Empty;
    public string IssuedByName { get; set; } = string.Empty;
    public int IssuedToUserId { get; set; }
    public string IssuedToName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime IssuedAt { get; set; }
    public decimal? ConfirmedQuantity { get; set; }
    public string? ConfirmationNotes { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public decimal UsedQuantity { get; set; }
    public decimal WastedQuantity { get; set; }
    public decimal ReturnedQuantity { get; set; }
    public decimal UnaccountedQuantity { get; set; }
    public string CustodyStatus { get; set; } = string.Empty;
    public IReadOnlyList<MaterialUsageResponseDto> Usage { get; set; } = [];
}

public sealed class StockTransferResponseDto
{
    public long Id { get; set; }
    public string TransferNumber { get; set; } = string.Empty;
    public int FromProjectId { get; set; }
    public string FromProjectName { get; set; } = string.Empty;
    public int ToProjectId { get; set; }
    public string ToProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string RequestedByName { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; }
    public int? DispatchedByUserId { get; set; }
    public string? DispatchedByName { get; set; }
    public DateTime? DispatchedAt { get; set; }
    public string? ReceivedByName { get; set; }
    public decimal? ReceivedQuantity { get; set; }
    public string? ReceiptNotes { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public string? ResolvedByName { get; set; }
    public string? ResolutionDisposition { get; set; }
    public decimal? ResolutionQuantity { get; set; }
    public string? ResolutionNotes { get; set; }
    public string? ResolutionEvidenceReference { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

public sealed class StockCountResponseDto
{
    public long Id { get; set; }
    public string CountNumber { get; set; } = string.Empty;
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal SystemQuantity { get; set; }
    public decimal CountedQuantity { get; set; }
    public decimal Variance { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string CountedByName { get; set; } = string.Empty;
    public DateTime CountedAt { get; set; }
    public string? ReviewedByName { get; set; }
    public string? ReviewNotes { get; set; }
    public DateTime? ReviewedAt { get; set; }
}
