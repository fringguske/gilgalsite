namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;
using System.Text;

public sealed class ChangeUsernameRequestDto : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 3)]
    public string NewUsername { get; init; } = string.Empty;

    [Required, StringLength(72, MinimumLength = 1)]
    public string CurrentPassword { get; init; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (CurrentPassword is not null && Encoding.UTF8.GetByteCount(CurrentPassword) > 72)
        {
            yield return new ValidationResult(
                "Current password cannot exceed 72 UTF-8 bytes.",
                [nameof(CurrentPassword)]);
        }
    }
}
