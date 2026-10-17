namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;
using System.Text;

public sealed class LoginRequestDto : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 3)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")]
    public string Username { get; set; } = string.Empty;

    [Required, StringLength(72, MinimumLength = 1)]
    public string Password { get; set; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Password is not null && Encoding.UTF8.GetByteCount(Password) > 72)
        {
            yield return new ValidationResult(
                "Password cannot exceed 72 UTF-8 bytes.",
                [nameof(Password)]);
        }
    }
}
