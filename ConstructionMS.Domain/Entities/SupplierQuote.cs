namespace ConstructionMS.Domain.Entities;

/// <summary>A supplier's immutable commercial offer captured during a sourcing round.</summary>
public class SupplierQuote
{
    public int Id { get; set; }

    public int SourcingRoundId { get; set; }
    public SourcingRound SourcingRound { get; set; } = null!;

    public int SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;

    public int RecordedByUserId { get; set; }
    public User RecordedByUser { get; set; } = null!;

    public string QuoteReference { get; set; } = string.Empty;
    public decimal QuantityOffered { get; set; }
    public decimal UnitPrice { get; set; }
    /// <summary>Material catalog reference price captured when this quote was recorded.</summary>
    public decimal StandardPriceSnapshot { get; set; }
    public DateOnly? ValidUntil { get; set; }
    public string? Notes { get; set; }
    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;
}
