import { dto, f, validationResult, type InferDto, type ValidationResult } from '../../Common/Validation'
import { DefaultDateOnly, DefaultedDtoSchema } from './CreateProjectRequestDto'

const base = dto({
  name: f.string().required().stringLength(150, 2),
  location: f.string().nullable().stringLength(300),
  budget: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
  startDate: f.dateOnly(),
  endDate: f.dateOnly().nullable(),
  /** Allowed values: "Active", "On Hold", "Completed", "Cancelled". */
  status: f.string().required().regex('^(Active|On Hold|Completed|Cancelled)$'),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.startDate === DefaultDateOnly) {
    results.push(validationResult('StartDate is required.', ['StartDate']))
  }

  if (v.endDate !== null && v.startDate !== DefaultDateOnly && v.endDate < v.startDate) {
    results.push(validationResult('EndDate cannot be earlier than StartDate.', ['EndDate']))
  }

  return results
})

/** Request body for updating a project. */
export const UpdateProjectRequestDto = new DefaultedDtoSchema<InferDto<typeof base>>(
  base.shape, base.validator, { status: 'Active' })
export type UpdateProjectRequestDto = InferDto<typeof base>
