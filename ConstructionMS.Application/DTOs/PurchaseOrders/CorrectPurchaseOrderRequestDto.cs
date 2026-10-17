namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

public sealed class CorrectPurchaseOrderRequestDto
{
    [Required]
    public DateOnly? ExpectedDeliveryDate { get; set; }

    [StringLength(300)]
    public string? DeliveryLocation { get; set; }

    [StringLength(1_000)]
    public string? Notes { get; set; }

    [Required, StringLength(1_000, MinimumLength = 3)]
    public string Reason { get; set; } = string.Empty;
}
