namespace ConstructionMS.Application.DTOs.Users;

using System.ComponentModel.DataAnnotations;
using System.Text;

/// <summary>
/// Request body for POST /api/users.
/// The caller supplies a password that is securely hashed before persistence.
/// </summary>
public class CreateUserRequestDto : IValidatableObject
{
    [Required, StringLength(50, MinimumLength = 3)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")]
    public string Username { get; set; } = string.Empty;

    /// <summary>Full display name, e.g. "Jane Mwangi". Required.</summary>
    [Required, StringLength(150, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    /// <summary>Email may be shared by test accounts; username remains unique.</summary>
    [Required, StringLength(254), EmailAddress]
    public string Email { get; set; } = string.Empty;

    /// <summary>Contact number. Required.</summary>
    [Required, StringLength(30), Phone]
    public string PhoneNumber { get; set; } = string.Empty;

    /// <summary>Password to hash before persistence.</summary>
    [Required, StringLength(72, MinimumLength = 12)]
    public string Password { get; set; } = string.Empty;

    /// <summary>Foreign key to the Roles table. Required.</summary>
    [Range(1, int.MaxValue)]
    public int RoleId { get; set; }

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
