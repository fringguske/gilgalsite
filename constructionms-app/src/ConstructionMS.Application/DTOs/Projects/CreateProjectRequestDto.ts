import { DtoSchema, dto, f, validationResult, type InferDto, type ValidationErrors, type ValidationResult } from '../../Common/Validation'

/** DateOnly default(DateOnly) as bound by DtoSchema when the member is missing. */
export const DefaultDateOnly = '0001-01-01'

/**
 * Applies C# property initializers (e.g. `Status = "Active"`) when the JSON member is
 * absent, which DtoSchema does not model on its own.
 */
export class DefaultedDtoSchema<T> extends DtoSchema<T> {
  constructor(
    shape: DtoSchema<T>['shape'],
    validator: ((value: T) => ValidationResult[]) | undefined,
    private readonly defaults: Record<string, unknown>,
  ) {
    super(shape, validator)
  }

  override bindInto(raw: unknown, prefix: string, errors: ValidationErrors): T {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const source = { ...(raw as Record<string, unknown>) }
      const present = new Set(Object.keys(source).map(key => key.toLowerCase()))
      for (const [key, value] of Object.entries(this.defaults)) {
        if (!present.has(key.toLowerCase())) source[key] = value
      }
      return super.bindInto(source, prefix, errors)
    }
    return super.bindInto(raw, prefix, errors)
  }
}

const base = dto({
  /** Project/site name. Required. */
  name: f.string().required().stringLength(150, 2),
  /** Physical location or address. Optional. */
  location: f.string().nullable().stringLength(300),
  /** Approved budget in the local currency (KES). Defaults to 0 until set. */
  budget: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
  /** Date the project kicked off. Required. */
  startDate: f.dateOnly(),
  /** Planned end date. Optional; leave null for open-ended projects. */
  endDate: f.dateOnly().nullable(),
  /** Initial status. Defaults to "Active". Allowed: "Active", "On Hold", "Completed", "Cancelled". */
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

export const CreateProjectRequestDto = new DefaultedDtoSchema<InferDto<typeof base>>(
  base.shape, base.validator, { status: 'Active' })
export type CreateProjectRequestDto = InferDto<typeof base>
