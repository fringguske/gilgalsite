namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

public sealed class ReopenSourcingRoundRequestDto
{
    [Required, StringLength(1_000, MinimumLength = 3)]
    public string Reason { get; set; } = string.Empty;

    public DateTimeOffset? QuoteDueAt { get; set; }
}
