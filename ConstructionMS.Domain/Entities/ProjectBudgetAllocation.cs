namespace ConstructionMS.Domain.Entities;

/// <summary>
/// The cost-code split belonging to one immutable project budget revision.
/// </summary>
public class ProjectBudgetAllocation
{
    public int Id { get; set; }

    public int ProjectBudgetId { get; set; }
    public ProjectBudget ProjectBudget { get; set; } = null!;

    public int CostCodeId { get; set; }
    public CostCode CostCode { get; set; } = null!;

    public decimal AllocatedAmount { get; set; }
}
