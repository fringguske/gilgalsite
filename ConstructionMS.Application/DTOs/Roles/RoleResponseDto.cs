namespace ConstructionMS.Application.DTOs.Roles;

/// <summary>Read model for a fixed system role.</summary>
public class RoleResponseDto
{
    public int Id { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
}
