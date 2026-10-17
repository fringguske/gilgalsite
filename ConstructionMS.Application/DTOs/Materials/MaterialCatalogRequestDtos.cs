namespace ConstructionMS.Application.DTOs.Materials;

using System.ComponentModel.DataAnnotations;

public sealed class CreateMaterialCatalogRequestDto
{
    [Range(1, int.MaxValue)]
    public int ProjectId { get; set; }

    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Category { get; set; }

    [Required, StringLength(30, MinimumLength = 1)]
    public string Unit { get; set; } = string.Empty;

    [Required, StringLength(500, MinimumLength = 3)]
    public string Purpose { get; set; } = string.Empty;
}

public sealed class ReviewMaterialCatalogRequestDto
{
    public bool Approve { get; set; }

    [Required, StringLength(1_000, MinimumLength = 3)]
    public string Notes { get; set; } = string.Empty;
}

public sealed class MaterialCatalogRequestResponseDto
{
    public int Id { get; init; }
    public string RequestNumber { get; init; } = string.Empty;
    public int ProjectId { get; init; }
    public string ProjectName { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Category { get; init; }
    public string Unit { get; init; } = string.Empty;
    public string Purpose { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int SubmittedByUserId { get; init; }
    public string SubmittedByName { get; init; } = string.Empty;
    public DateTime SubmittedAt { get; init; }
    public int? ReviewedByUserId { get; init; }
    public string? ReviewedByName { get; init; }
    public DateTime? ReviewedAt { get; init; }
    public string? ReviewNotes { get; init; }
    public int? ApprovedMaterialId { get; init; }
}
