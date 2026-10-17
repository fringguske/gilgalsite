namespace ConstructionMS.Application.DTOs.Materials;

using System.ComponentModel.DataAnnotations;

/// <summary>CEO-controlled policy applied only to purchase orders created after the change.</summary>
public sealed class SetMaterialTechnicalAcceptancePolicyRequestDto
{
    [Required]
    public bool? Required { get; set; }
}
