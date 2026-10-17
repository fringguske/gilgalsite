namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

public sealed class CreateSourcingRoundRequestDto
{
    [Range(1, int.MaxValue)]
    public int RequisitionId { get; set; }

    public DateTimeOffset? QuoteDueAt { get; set; }

    [StringLength(1_000)]
    public string? Notes { get; set; }
}
