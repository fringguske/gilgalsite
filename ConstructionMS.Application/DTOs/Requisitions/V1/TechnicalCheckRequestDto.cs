namespace ConstructionMS.Application.DTOs.Requisitions.V1;

using System.ComponentModel.DataAnnotations;

/// <summary>An engineer's technical assessment. Engineer identity comes from claims.</summary>
public sealed class TechnicalCheckRequestDto
{
    /// <summary>Allowed values: Verified, RevisionRequired.</summary>
    [Required]
    [RegularExpression("^(Verified|RevisionRequired)$")]
    public string Outcome { get; set; } = string.Empty;

    [StringLength(1_000)]
    public string? Comments { get; set; }

    [Range(1, int.MaxValue)]
    public int ExpectedRevision { get; set; }
}
