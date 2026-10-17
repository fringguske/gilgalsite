namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class RecordSupplierQuoteRequestDto
{
    [Range(1, int.MaxValue)]
    public int SupplierId { get; set; }

    [Required, StringLength(100)]
    public string QuoteReference { get; set; } = string.Empty;

    [Range(typeof(decimal), "0.001", "999999999999999.999")]
    [DecimalPrecision(18, 3)]
    public decimal QuantityOffered { get; set; }

    [Range(typeof(decimal), "0.01", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal UnitPrice { get; set; }

    public DateOnly? ValidUntil { get; set; }

    [StringLength(1_000)]
    public string? Notes { get; set; }
}
