namespace ConstructionMS.Application.DTOs.Projects;

public sealed class ProjectSummaryDto
{
    public bool CanViewFinancials { get; init; }
    public ProjectResponseDto Project { get; init; } = new();
    public ProjectBudgetResponseDto? CurrentBudget { get; init; }
    public IReadOnlyList<CostCodeResponseDto> CostCodes { get; init; } = [];
    public ProjectProgressVerificationResponseDto? LatestProgress { get; init; }
    public int ProgressVerificationCount { get; init; }
    public decimal? PendingCommitmentAmount { get; init; }
    public decimal? ApprovedCommitmentAmount { get; init; }
    public decimal? RemainingAfterCommitments { get; init; }
}
