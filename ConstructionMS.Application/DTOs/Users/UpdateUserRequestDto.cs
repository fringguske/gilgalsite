namespace ConstructionMS.Application.DTOs.Users;

using System.ComponentModel.DataAnnotations;

/// <summary>User profile fields; password changes are not accepted here.</summary>
public class UpdateUserRequestDto
{
    [Required, StringLength(50, MinimumLength = 3)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")]
    public string Username { get; set; } = string.Empty;

    /// <summary>Updated full name. Required.</summary>
    [Required, StringLength(150, MinimumLength = 2)]
    public string FullName { get; set; } = string.Empty;

    /// <summary>Updated email. Email addresses may be shared. Required.</summary>
    [Required, StringLength(254), EmailAddress]
    public string Email { get; set; } = string.Empty;

    /// <summary>Updated phone number. Required.</summary>
    [Required, StringLength(30), Phone]
    public string PhoneNumber { get; set; } = string.Empty;

    /// <summary>Updated role. Required.</summary>
    [Range(1, int.MaxValue)]
    public int RoleId { get; set; }
}
