namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;

public sealed class SwitchRoleRequestDto
{
    [Required, StringLength(80, MinimumLength = 2)]
    public string Role { get; init; } = string.Empty;
}
