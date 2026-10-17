namespace ConstructionMS.Domain.Entities;

/// <summary>
/// Assigns a user to a project without embedding a fixed list of sites on the
/// user record. Assignments are deactivated rather than deleted so historical
/// scope decisions remain explainable.
/// </summary>
public class UserProjectAssignment
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public int? AssignedByUserId { get; set; }
    public User? AssignedByUser { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
}
