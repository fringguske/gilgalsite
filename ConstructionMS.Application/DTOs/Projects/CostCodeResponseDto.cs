namespace ConstructionMS.Application.DTOs.Projects;

public sealed class CostCodeResponseDto
{
    public int Id { get; init; }
    public int ProjectId { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public bool IsActive { get; init; }
    public decimal? CurrentAllocation { get; init; }
    public decimal? PendingCommitmentAmount { get; init; }
    public decimal? ApprovedCommitmentAmount { get; init; }
    public decimal? RemainingAfterCommitments { get; init; }
}
