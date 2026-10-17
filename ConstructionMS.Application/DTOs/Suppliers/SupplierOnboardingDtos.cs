namespace ConstructionMS.Application.DTOs.Suppliers;

using System.ComponentModel.DataAnnotations;

public sealed class CreateSupplierOnboardingRequestDto
{
    [Required, StringLength(200, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(150, MinimumLength = 2)]
    public string ContactPerson { get; set; } = string.Empty;

    [Required, StringLength(30, MinimumLength = 7), Phone]
    public string PhoneNumber { get; set; } = string.Empty;

    [StringLength(254), EmailAddress]
    public string? Email { get; set; }

    [Required, StringLength(20, MinimumLength = 5)]
    public string KraPin { get; set; } = string.Empty;

    [StringLength(30), Phone]
    public string? MpesaNumber { get; set; }

    [Required, StringLength(100, MinimumLength = 2)]
    public string Category { get; set; } = string.Empty;
}

public sealed class ReviewSupplierOnboardingRequestDto
{
    public bool Approve { get; set; }

    [Required, StringLength(1_000, MinimumLength = 3)]
    public string Notes { get; set; } = string.Empty;
}

public sealed class SupplierOnboardingResponseDto
{
    public int Id { get; init; }
    public string RequestNumber { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string ContactPerson { get; init; } = string.Empty;
    public string PhoneNumber { get; init; } = string.Empty;
    public string? Email { get; init; }
    public string KraPin { get; init; } = string.Empty;
    public string? MpesaNumber { get; init; }
    public string Category { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int SubmittedByUserId { get; init; }
    public string SubmittedByName { get; init; } = string.Empty;
    public DateTime SubmittedAt { get; init; }
    public int? ReviewedByUserId { get; init; }
    public string? ReviewedByName { get; init; }
    public DateTime? ReviewedAt { get; init; }
    public string? ReviewNotes { get; init; }
    public int? ApprovedSupplierId { get; init; }
}
