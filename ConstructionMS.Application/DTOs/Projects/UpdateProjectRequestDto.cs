namespace ConstructionMS.Application.DTOs.Projects;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>Request body for updating a project.</summary>
public class UpdateProjectRequestDto : IValidatableObject
{
    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    [StringLength(300)]
    public string? Location { get; set; }

    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal Budget { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }

    /// <summary>Allowed values: "Active", "On Hold", "Completed", "Cancelled".</summary>
    [Required, RegularExpression("^(Active|On Hold|Completed|Cancelled)$")]
    public string Status { get; set; } = "Active";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (StartDate == default)
        {
            yield return new ValidationResult(
                "StartDate is required.",
                [nameof(StartDate)]);
        }

        if (EndDate.HasValue && StartDate != default && EndDate.Value < StartDate)
        {
            yield return new ValidationResult(
                "EndDate cannot be earlier than StartDate.",
                [nameof(EndDate)]);
        }
    }
}
