namespace ConstructionMS.Application.DTOs.Projects;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class CreateProjectProgressVerificationRequestDto
{
    [Range(typeof(decimal), "0", "100")]
    [DecimalPrecision(5, 2)]
    public decimal PercentageComplete { get; set; }

    [Required, StringLength(2_000, MinimumLength = 5)]
    public string WorkSummary { get; set; } = string.Empty;

    /// <summary>A document, photo-set or inspection reference; never raw file data.</summary>
    [StringLength(500)]
    public string? EvidenceReference { get; set; }
}
