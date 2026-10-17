import Decimal from 'decimal.js'
import { DecimalPrecision } from './DecimalPrecisionAttribute'

/**
 * Port of System.ComponentModel.DataAnnotations + ASP.NET Core [ApiController]
 * model binding, so request DTOs keep their exact validation rules and the
 * ProblemDetails `errors` messages the React client displays.
 *
 * Binding mirrors System.Text.Json web defaults:
 *   - property names match case-insensitively (camelCase from the client);
 *   - numbers may also be sent as numeric strings;
 *   - a missing non-nullable value type keeps its default (0 / false);
 *   - a non-nullable C# `string` is implicitly [Required] (empty string fails).
 *
 * Usage (one schema + one inferred type per C# DTO class):
 *
 *   export const BudgetAllocationRequestDto = dto({
 *     costCodeId: f.int().range(1, INT_MAX),
 *     amount: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
 *   })
 *   export type BudgetAllocationRequestDto = InferDto<typeof BudgetAllocationRequestDto>
 *
 *   export const SetProjectBudgetRequestDto = dto({
 *     approvedAmount: f.decimal().range('0', '9999999999999999.99').decimalPrecision(18, 2),
 *     notes: f.string().nullable().stringLength(1_000),
 *     allocations: f.list(BudgetAllocationRequestDto),
 *   }, (value) => {                         // IValidatableObject.Validate
 *     const results: ValidationResult[] = []
 *     if (...) results.push(validationResult('Each cost code may appear only once.', ['Allocations']))
 *     return results
 *   })
 */

export type ValidationErrors = Record<string, string[]>

export interface ValidationResult {
  errorMessage: string
  memberNames: string[]
}

export function validationResult(errorMessage: string, memberNames: string[] = []): ValidationResult {
  return { errorMessage, memberNames }
}

/** Thrown by controller binding helpers; rendered as a 400 ValidationProblemDetails response. */
export class ModelValidationError extends Error {
  constructor(readonly errors: ValidationErrors) {
    super('One or more validation errors occurred.')
    this.name = 'ModelValidationError'
  }
}

function addError(errors: ValidationErrors, key: string, message: string) {
  ;(errors[key] ??= []).push(message)
}

function displayName(key: string): string {
  return key.length === 0 ? key : key[0]!.toUpperCase() + key.slice(1)
}

function joinPath(prefix: string, member: string): string {
  return prefix ? `${prefix}.${member}` : member
}

type Kind = 'int' | 'long' | 'decimal' | 'double' | 'bool' | 'string' | 'dateOnly' | 'dateTime' | 'guid' | 'list' | 'object' | 'json'

const clrTypeName: Record<Kind, string> = {
  int: 'System.Int32',
  long: 'System.Int64',
  decimal: 'System.Decimal',
  double: 'System.Double',
  bool: 'System.Boolean',
  string: 'System.String',
  dateOnly: 'System.DateOnly',
  dateTime: 'System.DateTime',
  guid: 'System.Guid',
  list: 'System.Collections.Generic.List',
  object: 'System.Object',
  json: 'System.Text.Json.JsonElement',
}

class ConversionFailure {
  constructor(readonly kind: Kind) {}
}

interface FieldRules {
  required?: boolean
  stringLength?: { max: number; min: number }
  range?: { min: Decimal; max: Decimal; minText: string; maxText: string }
  regex?: { pattern: string; regex: RegExp }
  compare?: { other: string; message?: string }
  decimalPrecision?: { precision: number; scale: number }
  minLength?: number
  maxLength?: number
  messages: Partial<Record<'required' | 'stringLength' | 'range' | 'regex', string>>
}

export class Field<T> {
  /** Phantom type carrier for InferDto. */
  declare readonly __type: T

  constructor(
    readonly kind: Kind,
    readonly isNullable: boolean,
    readonly rules: FieldRules,
    readonly element?: Field<unknown> | DtoSchema<unknown>,
  ) {}

  private with<U = T>(changes: Partial<FieldRules>, nullable = this.isNullable): Field<U> {
    return new Field<U>(this.kind, nullable, { ...this.rules, ...changes, messages: { ...this.rules.messages, ...changes.messages } }, this.element)
  }

  /** C# `T?` (nullable value type or nullable reference). Missing/null binds to null. */
  nullable(): Field<T | null> {
    return this.with<T | null>({}, true)
  }

  /** [Required] (optionally with ErrorMessage). */
  required(message?: string): Field<T> {
    return this.with({ required: true, messages: message ? { required: message } : {} })
  }

  /** [StringLength(max, MinimumLength = min)] */
  stringLength(max: number, min = 0, message?: string): Field<T> {
    return this.with({ stringLength: { max, min }, messages: message ? { stringLength: message } : {} })
  }

  /** [Range(min, max)] / [Range(typeof(decimal), "min", "max")]. Pass decimal bounds as strings. */
  range(min: number | string, max: number | string, message?: string): Field<T> {
    return this.with({
      range: { min: new Decimal(min), max: new Decimal(max), minText: String(min), maxText: rangeDisplayText(max) },
      messages: message ? { range: message } : {},
    })
  }

  /** [RegularExpression("pattern")] — like .NET, the whole value must match. */
  regex(pattern: string, message?: string): Field<T> {
    return this.with({ regex: { pattern, regex: new RegExp(`^(?:${pattern})$`) }, messages: message ? { regex: message } : {} })
  }

  /** [Compare(nameof(Other), ErrorMessage = "...")] — `other` is the camelCase TS property. */
  compare(other: string, message?: string): Field<T> {
    return this.with({ compare: { other, message } })
  }

  /** [DecimalPrecision(precision, scale)] */
  decimalPrecision(precision: number, scale: number): Field<T> {
    return this.with({ decimalPrecision: { precision, scale } })
  }

  /** [MinLength(n)] for collections/strings. */
  minLength(length: number): Field<T> {
    return this.with({ minLength: length })
  }

  /** [MaxLength(n)] for collections/strings. */
  maxLength(length: number): Field<T> {
    return this.with({ maxLength: length })
  }

  /** @internal Converts a raw JSON value or throws ConversionFailure. */
  convert(raw: unknown, path: string, errors: ValidationErrors): unknown {
    if (raw === undefined || raw === null) {
      if (raw === null && !this.isNullable && !['string', 'list', 'object', 'json'].includes(this.kind)) {
        throw new ConversionFailure(this.kind)
      }
      return raw === undefined ? this.defaultValue() : this.isNullable || this.kind === 'string' ? null : this.defaultValue()
    }

    switch (this.kind) {
      case 'int':
      case 'long': {
        const number = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN
        const limit = this.kind === 'int' ? 2_147_483_647 : Number.MAX_SAFE_INTEGER
        if (!Number.isInteger(number) || number > limit || number < -limit - 1) throw new ConversionFailure(this.kind)
        return number
      }
      case 'decimal':
      case 'double': {
        const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN
        if (!Number.isFinite(number)) throw new ConversionFailure(this.kind)
        return number
      }
      case 'bool':
        if (typeof raw !== 'boolean') throw new ConversionFailure(this.kind)
        return raw
      case 'string':
        if (typeof raw !== 'string') throw new ConversionFailure(this.kind)
        return raw
      case 'dateOnly':
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
          throw new ConversionFailure(this.kind)
        }
        return raw
      case 'dateTime': {
        if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) throw new ConversionFailure(this.kind)
        return new Date(raw)
      }
      case 'guid':
        if (typeof raw !== 'string' || !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(raw)) {
          throw new ConversionFailure(this.kind)
        }
        return raw.toLowerCase()
      case 'json':
        return raw
      case 'list': {
        if (!Array.isArray(raw)) throw new ConversionFailure(this.kind)
        return raw.map((item, index) => {
          const itemPath = `${path}[${index}]`
          if (this.element instanceof DtoSchema) return this.element.bindInto(item, itemPath, errors)
          return (this.element as Field<unknown>).convert(item, itemPath, errors)
        })
      }
      case 'object':
        return (this.element as DtoSchema<unknown>).bindInto(raw, path, errors)
    }
  }

  defaultValue(): unknown {
    if (this.isNullable) return null
    switch (this.kind) {
      case 'int':
      case 'long':
      case 'decimal':
      case 'double':
        return 0
      case 'bool':
        return false
      case 'string':
        return ''
      case 'list':
        return []
      case 'dateOnly':
        return '0001-01-01'
      case 'dateTime':
        return new Date('0001-01-01T00:00:00Z')
      case 'guid':
        return '00000000-0000-0000-0000-000000000000'
      default:
        return null
    }
  }

  /** @internal DataAnnotations attribute checks for one bound value. */
  validate(value: unknown, name: string, key: string, owner: Record<string, unknown>, errors: ValidationErrors) {
    const { rules } = this
    const implicitRequired = this.kind === 'string' && !this.isNullable
    if ((rules.required || implicitRequired) && (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))) {
      addError(errors, key, rules.messages.required ?? `The ${name} field is required.`)
      // DataAnnotations still runs the other attributes (e.g. StringLength) on "" / whitespace.
      if (value === null || value === undefined) return
    }

    if (value === null || value === undefined) return

    if (rules.stringLength && typeof value === 'string') {
      const { max, min } = rules.stringLength
      if (value.length > max || value.length < min) {
        addError(errors, key, rules.messages.stringLength ?? (min > 0
          ? `The field ${name} must be a string with a minimum length of ${min} and a maximum length of ${max}.`
          : `The field ${name} must be a string with a maximum length of ${max}.`))
      }
    }

    if (rules.minLength !== undefined && (Array.isArray(value) || typeof value === 'string') && value.length < rules.minLength) {
      addError(errors, key, `The field ${name} must be a string or array type with a minimum length of '${rules.minLength}'.`)
    }

    if (rules.maxLength !== undefined && (Array.isArray(value) || typeof value === 'string') && value.length > rules.maxLength) {
      addError(errors, key, `The field ${name} must be a string or array type with a maximum length of '${rules.maxLength}'.`)
    }

    if (rules.range && typeof value === 'number') {
      const number = new Decimal(value)
      if (number.lt(rules.range.min) || number.gt(rules.range.max)) {
        addError(errors, key, rules.messages.range ?? `The field ${name} must be between ${rules.range.minText} and ${rules.range.maxText}.`)
      }
    }

    if (rules.regex && typeof value === 'string' && value !== '' && !rules.regex.regex.test(value)) {
      addError(errors, key, rules.messages.regex ?? `The field ${name} must match the regular expression '${rules.regex.pattern}'.`)
    }

    if (rules.compare && value !== owner[rules.compare.other]) {
      addError(errors, key, rules.compare.message ?? `'${name}' and '${displayName(rules.compare.other)}' do not match.`)
    }

    if (rules.decimalPrecision && typeof value === 'number'
      && !DecimalPrecision.fits(value, rules.decimalPrecision.precision, rules.decimalPrecision.scale)) {
      addError(errors, key, DecimalPrecision.formatErrorMessage(name, rules.decimalPrecision.precision, rules.decimalPrecision.scale))
    }
  }
}

const emptyRules: FieldRules = { messages: {} }

/**
 * `[Range(1, long.MaxValue)]` compiles to RangeAttribute(double, double), so .NET prints the
 * bound as the double 9.223372036854776E+18; every other bound prints as written.
 */
function rangeDisplayText(value: number | string): string {
  return String(value) === '9223372036854775807' ? '9.223372036854776E+18' : String(value)
}

/** Field builders: one per C# property type. */
export const f = Object.freeze({
  int: () => new Field<number>('int', false, emptyRules),
  long: () => new Field<number>('long', false, emptyRules),
  decimal: () => new Field<number>('decimal', false, emptyRules),
  double: () => new Field<number>('double', false, emptyRules),
  bool: () => new Field<boolean>('bool', false, emptyRules),
  string: () => new Field<string>('string', false, emptyRules),
  /** C# DateOnly, bound as "YYYY-MM-DD". */
  dateOnly: () => new Field<string>('dateOnly', false, emptyRules),
  /** C# DateTime / DateTimeOffset, bound to a JS Date. */
  dateTime: () => new Field<Date>('dateTime', false, emptyRules),
  guid: () => new Field<string>('guid', false, emptyRules),
  /** Arbitrary JSON (JsonElement / object). */
  json: () => new Field<unknown>('json', true, emptyRules),
  list: <E>(element: Field<E> | DtoSchema<E>) => new Field<E[]>('list', false, emptyRules, element as Field<unknown> | DtoSchema<unknown>),
  object: <E>(schema: DtoSchema<E>) => new Field<E>('object', false, emptyRules, schema as DtoSchema<unknown>),
})

type Shape = Record<string, Field<unknown>>
type ShapeValue<S extends Shape> = { [K in keyof S]: S[K]['__type'] }

export class DtoSchema<T> {
  declare readonly __type: T

  constructor(
    readonly shape: Shape,
    readonly validator?: (value: T) => ValidationResult[],
  ) {}

  /**
   * Binds and validates a JSON body. Returns the typed DTO or throws
   * ModelValidationError carrying ASP.NET-style error keys and messages.
   */
  bind(raw: unknown): T {
    if (raw === undefined) {
      throw new ModelValidationError({
        '': ['A non-empty request body is required.'],
        request: ['The request field is required.'],
      })
    }

    const errors: ValidationErrors = {}
    const value = this.bindInto(raw, '', errors)
    if (Object.keys(errors).length > 0) throw new ModelValidationError(errors)
    return value
  }

  /** @internal */
  bindInto(raw: unknown, prefix: string, errors: ValidationErrors): T {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      addError(errors, prefix ? `$.${prefix}` : '$', `The JSON value could not be converted to ${clrTypeName.object}.`)
      return null as T
    }

    const source = raw as Record<string, unknown>
    const lowerKeys = new Map(Object.keys(source).map(key => [key.toLowerCase(), key]))
    const result: Record<string, unknown> = {}
    const errorCountBefore = Object.keys(errors).length
    for (const [property, field] of Object.entries(this.shape)) {
      const sourceKey = lowerKeys.get(property.toLowerCase())
      const rawValue = sourceKey === undefined ? undefined : source[sourceKey]
      const path = joinPath(prefix, property)
      try {
        result[property] = field.convert(rawValue, path, errors)
      } catch (error) {
        if (error instanceof ConversionFailure) {
          addError(errors, `$.${path}`, `The JSON value could not be converted to ${clrTypeName[error.kind]}. Path: $.${path}.`)
          result[property] = field.defaultValue()
          continue
        }
        throw error
      }
    }

    for (const [property, field] of Object.entries(this.shape)) {
      field.validate(result[property], displayName(property), joinPath(prefix, displayName(property)), result, errors)
    }

    // Like MVC, type-level IValidatableObject rules run only when the members are valid.
    if (this.validator && Object.keys(errors).length === errorCountBefore) {
      for (const item of this.validator(result as T)) {
        const members = item.memberNames.length > 0 ? item.memberNames : ['']
        for (const member of members) addError(errors, member ? joinPath(prefix, member) : prefix, item.errorMessage)
      }
    }

    return result as T
  }
}

export function dto<S extends Shape>(
  shape: S,
  validator?: (value: ShapeValue<S>) => ValidationResult[],
): DtoSchema<ShapeValue<S>> {
  return new DtoSchema<ShapeValue<S>>(shape, validator)
}

export type InferDto<D> = D extends DtoSchema<infer T> ? T : never

/** Encoding.UTF8.GetByteCount */
export function utf8ByteCount(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
