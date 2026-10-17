namespace ConstructionMS.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;

public sealed class UpdateProjectAssignmentsRequestDto
{
    [Required]
    public IReadOnlyCollection<int> ProjectIds { get; set; } = [];
}
