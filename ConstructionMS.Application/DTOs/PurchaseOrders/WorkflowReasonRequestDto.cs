namespace ConstructionMS.Application.DTOs.PurchaseOrders;

using System.ComponentModel.DataAnnotations;

/// <summary>A required reason for a negative or reversal workflow action.</summary>
public sealed class WorkflowReasonRequestDto
{
    [Required, StringLength(1_000, MinimumLength = 3)]
    public string Reason { get; set; } = string.Empty;
}
