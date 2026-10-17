namespace ConstructionMS.Domain.Entities;

/// <summary>
/// A stable project cost category. Budget amounts live in versioned
/// ProjectBudgetAllocation rows rather than being overwritten here.
/// </summary>
public class CostCode
{
    public int Id { get; set; }

    public int ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
