namespace ConstructionMS.Application.DTOs.Projects;

using System.ComponentModel.DataAnnotations;

public sealed class CreateCostCodeRequestDto
{
    [Required, StringLength(30, MinimumLength = 1)]
    public string Code { get; set; } = string.Empty;

    [Required, StringLength(150, MinimumLength = 2)]
    public string Name { get; set; } = string.Empty;
}
