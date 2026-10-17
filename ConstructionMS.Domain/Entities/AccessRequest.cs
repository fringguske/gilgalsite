namespace ConstructionMS.Domain.Entities;

public class AccessRequest
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public int? ReviewedByUserId { get; set; }
    public User? ReviewedByUser { get; set; }
    public int? ApprovedUserId { get; set; }
    public User? ApprovedUser { get; set; }
    public string? DecisionNote { get; set; }
}
