namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.Text.Json.Serialization;

public sealed class SourcingRoundResponseDto
{
    public int Id { get; set; }
    public int RequisitionId { get; set; }
    public int ProjectId { get; set; }
    public string ProjectName { get; set; } = string.Empty;
    public int MaterialId { get; set; }
    public string MaterialName { get; set; } = string.Empty;
    public string MaterialUnit { get; set; } = string.Empty;
    public decimal RequestedQuantity { get; set; }
    public int CreatedByUserId { get; set; }
    public string CreatedByUserName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? QuoteDueAt { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public IReadOnlyList<SupplierQuoteResponseDto> Quotes { get; set; } = [];
    public IReadOnlyList<SourcingRoundEventResponseDto> Events { get; set; } = [];
}

public sealed class SourcingRoundEventResponseDto
{
    public long Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public int ActorUserId { get; set; }
    public string ActorUserName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime OccurredAt { get; set; }
}

public sealed class SupplierQuoteResponseDto
{
    public int Id { get; set; }
    public int SourcingRoundId { get; set; }
    public int SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string QuoteReference { get; set; } = string.Empty;
    public decimal QuantityOffered { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal StandardPriceSnapshot { get; set; }
    public decimal? PriceVariancePercentage { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? PriceAboveStandard { get; set; }
    public decimal TotalPrice { get; set; }
    public DateOnly? ValidUntil { get; set; }
    public int RecordedByUserId { get; set; }
    public string RecordedByUserName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime RecordedAt { get; set; }
}
