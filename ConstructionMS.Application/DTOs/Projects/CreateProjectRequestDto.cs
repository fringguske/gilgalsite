namespace ConstructionMS.Application.DTOs.Projects;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

/// <summary>
/// Request body for POST /api/projects.
/// </summary>
public class CreateProjectRequestDto : IValidatableObject
{
    /// <summary>Project/site name. Required.</summary>
    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Physical location or address. Optional.</summary>
    [StringLength(300)]
    public string? Location { get; set; }

    /// <summary>Approved budget in the local currency (KES). Defaults to 0 until set.</summary>
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal Budget { get; set; }

    /// <summary>Date the project kicked off. Required.</summary>
    public DateOnly StartDate { get; set; }

    /// <summary>Planned end date. Optional; leave null for open-ended projects.</summary>
    public DateOnly? EndDate { get; set; }

    /// <summary>
    /// Initial status. Defaults to "Active".
    /// Allowed values: "Active", "On Hold", "Completed", "Cancelled".
    /// </summary>
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
