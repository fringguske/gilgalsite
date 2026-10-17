namespace ConstructionMS.Application.DTOs.Users;

/// <summary>
/// Safe user projection. Password hashes are deliberately absent.
/// </summary>
public class UserResponseDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;

    /// <summary>Whether the user is currently active.</summary>
    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    public int RoleId { get; set; }

    /// <summary>Role name projected for display convenience.</summary>
    public string RoleName { get; set; } = string.Empty;
}
