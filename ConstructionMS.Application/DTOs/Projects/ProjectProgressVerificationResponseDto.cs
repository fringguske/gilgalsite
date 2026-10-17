namespace ConstructionMS.Application.DTOs.Projects;

public sealed class ProjectProgressVerificationResponseDto
{
    public int Id { get; init; }
    public int ProjectId { get; init; }
    public decimal PercentageComplete { get; init; }
    public string WorkSummary { get; init; } = string.Empty;
    public string? EvidenceReference { get; init; }
    public int VerifiedByUserId { get; init; }
    public string VerifiedByUserName { get; init; } = string.Empty;
    public DateTime VerifiedAt { get; init; }
}
