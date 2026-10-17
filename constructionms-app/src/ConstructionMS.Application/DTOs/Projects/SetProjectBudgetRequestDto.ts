import { sum } from '../../Common/Money'
import { dto, f, validationResult, type InferDto, type ValidationResult } from '../../Common/Validation'
import { INT_MAX } from '../../Common/Pagination'

export const BudgetAllocationRequestDto = dto({
  costCodeId: f.int().range(1, INT_MAX),
  amount: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
})
export type BudgetAllocationRequestDto = InferDto<typeof BudgetAllocationRequestDto>

export const SetProjectBudgetRequestDto = dto({
  approvedAmount: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
  notes: f.string().nullable().stringLength(1_000),
  allocations: f.list(BudgetAllocationRequestDto),
}, (v) => {
  const results: ValidationResult[] = []
  const ids = v.allocations.map(item => item.costCodeId)
  if (new Set(ids).size !== ids.length) {
    results.push(validationResult('Each cost code may appear only once.', ['Allocations']))
  }

  if (sum(v.allocations.map(item => item.amount)).gt(v.approvedAmount)) {
    results.push(validationResult(
      'Cost-code allocations cannot exceed the approved budget.',
      ['Allocations', 'ApprovedAmount']))
  }

  return results
})
export type SetProjectBudgetRequestDto = InferDto<typeof SetProjectBudgetRequestDto>
