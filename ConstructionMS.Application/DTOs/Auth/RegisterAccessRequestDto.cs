namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;
using System.Text;

public sealed class RegisterAccessRequestDto : IValidatableObject
{
    [Required, StringLength(254), EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required, StringLength(50, MinimumLength = 3)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")]
    public string Username { get; init; } = string.Empty;

    [Required, StringLength(72, MinimumLength = 12)]
    public string Password { get; init; } = string.Empty;

    [Required, Compare(nameof(Password), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; init; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Password is not null && Encoding.UTF8.GetByteCount(Password) > 72)
        {
            yield return new ValidationResult(
                "Password cannot exceed 72 UTF-8 bytes.",
                [nameof(Password)]);
        }

        if (ConfirmPassword is not null && Encoding.UTF8.GetByteCount(ConfirmPassword) > 72)
        {
            yield return new ValidationResult(
                "Password confirmation cannot exceed 72 UTF-8 bytes.",
                [nameof(ConfirmPassword)]);
        }
    }
}

public sealed class AccessRequestResponseDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime RequestedAt { get; init; }
    public DateTime? ReviewedAt { get; init; }
    public string? ReviewedByName { get; init; }
    public int? ApprovedUserId { get; init; }
    public string? DecisionNote { get; init; }
}

public sealed class ApproveAccessRequestDto
{
    [Range(1, int.MaxValue)]
    public int RoleId { get; init; }

    public IReadOnlyList<int> ProjectIds { get; init; } = [];
}

public sealed class RejectAccessRequestDto
{
    [Required, StringLength(500, MinimumLength = 3)]
    public string Reason { get; init; } = string.Empty;
}
