namespace ConstructionMS.Domain.Entities;

public class Supplier
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ContactPerson { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? KraPin { get; set; }
    public string? MpesaNumber { get; set; }
    public string? Category { get; set; }
    public bool IsBlacklisted { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
