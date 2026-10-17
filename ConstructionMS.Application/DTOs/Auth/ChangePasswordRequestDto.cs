namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;
using System.Text;

public sealed class ChangePasswordRequestDto : IValidatableObject
{
    [Required, StringLength(72, MinimumLength = 1)]
    public string CurrentPassword { get; init; } = string.Empty;

    [Required, StringLength(72, MinimumLength = 12)]
    public string NewPassword { get; init; } = string.Empty;

    [Required, Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmNewPassword { get; init; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (CurrentPassword is not null && Encoding.UTF8.GetByteCount(CurrentPassword) > 72)
        {
            yield return new ValidationResult(
                "Current password cannot exceed 72 UTF-8 bytes.",
                [nameof(CurrentPassword)]);
        }

        if (NewPassword is not null && Encoding.UTF8.GetByteCount(NewPassword) > 72)
        {
            yield return new ValidationResult(
                "New password cannot exceed 72 UTF-8 bytes.",
                [nameof(NewPassword)]);
        }

        if (ConfirmNewPassword is not null
            && Encoding.UTF8.GetByteCount(ConfirmNewPassword) > 72)
        {
            yield return new ValidationResult(
                "Password confirmation cannot exceed 72 UTF-8 bytes.",
                [nameof(ConfirmNewPassword)]);
        }
    }
}
