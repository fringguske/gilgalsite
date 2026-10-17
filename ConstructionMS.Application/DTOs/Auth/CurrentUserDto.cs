namespace ConstructionMS.Application.DTOs.Auth;

using System.Text.Json.Serialization;

public sealed class CurrentUserDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string ActualRole { get; init; } = string.Empty;
    public bool CanSwitchRoles { get; init; }
    public IReadOnlyList<string> AvailableRoles { get; init; } = [];
    public IReadOnlyList<AssignedProjectDto> Projects { get; init; } = [];

    [JsonIgnore]
    public int CredentialVersion { get; init; }
}

public sealed class AssignedProjectDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}
