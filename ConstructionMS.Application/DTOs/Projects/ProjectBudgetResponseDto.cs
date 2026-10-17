namespace ConstructionMS.Application.DTOs.Projects;

public sealed class ProjectBudgetResponseDto
{
    public int Id { get; init; }
    public int ProjectId { get; init; }
    public decimal ApprovedAmount { get; init; }
    public decimal AllocatedAmount { get; init; }
    public decimal UnallocatedAmount => ApprovedAmount - AllocatedAmount;
    public int? ApprovedByUserId { get; init; }
    public string? ApprovedByUserName { get; init; }
    public string ApprovalSource { get; init; } = string.Empty;
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public IReadOnlyList<BudgetAllocationResponseDto> Allocations { get; init; } = [];
}

public sealed class BudgetAllocationResponseDto
{
    public int CostCodeId { get; init; }
    public string CostCode { get; init; } = string.Empty;
    public string CostCodeName { get; init; } = string.Empty;
    public decimal Amount { get; init; }
}
