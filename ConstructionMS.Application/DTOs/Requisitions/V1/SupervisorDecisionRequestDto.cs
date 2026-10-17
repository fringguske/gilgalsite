namespace ConstructionMS.Application.DTOs.Requisitions.V1;

using System.ComponentModel.DataAnnotations;

/// <summary>A supervisor's decision. Supervisor identity comes from claims.</summary>
public sealed class SupervisorDecisionRequestDto
{
    /// <summary>Allowed values: Approve, Reject, ReturnForRevision.</summary>
    [Required]
    [RegularExpression("^(Approve|Reject|ReturnForRevision)$")]
    public string Decision { get; set; } = string.Empty;

    [StringLength(1_000)]
    public string? Comments { get; set; }

    [Range(1, int.MaxValue)]
    public int ExpectedRevision { get; set; }
}
