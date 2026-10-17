namespace ConstructionMS.Application.DTOs.Projects;

using ConstructionMS.Application.Common;
using System.ComponentModel.DataAnnotations;

public sealed class SetProjectBudgetRequestDto : IValidatableObject
{
    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal ApprovedAmount { get; set; }

    [StringLength(1_000)]
    public string? Notes { get; set; }

    public List<BudgetAllocationRequestDto> Allocations { get; set; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Allocations.GroupBy(item => item.CostCodeId).Any(group => group.Count() > 1))
        {
            yield return new ValidationResult(
                "Each cost code may appear only once.",
                [nameof(Allocations)]);
        }

        if (Allocations.Sum(item => item.Amount) > ApprovedAmount)
        {
            yield return new ValidationResult(
                "Cost-code allocations cannot exceed the approved budget.",
                [nameof(Allocations), nameof(ApprovedAmount)]);
        }
    }
}

public sealed class BudgetAllocationRequestDto
{
    [Range(1, int.MaxValue)]
    public int CostCodeId { get; set; }

    [Range(typeof(decimal), "0", "9999999999999999.99")]
    [DecimalPrecision(18, 2)]
    public decimal Amount { get; set; }
}
