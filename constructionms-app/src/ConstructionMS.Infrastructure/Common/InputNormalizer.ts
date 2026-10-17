import { ArgumentError, ArgumentOutOfRangeError } from '@/ConstructionMS.Application/Common/Exceptions'
import { DecimalPrecision } from '@/ConstructionMS.Application/Common/DecimalPrecisionAttribute'
import { utf8ByteCount } from '@/ConstructionMS.Application/Common/Validation'

const UsernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
// string.Trim(OuterWhitespace): only these six characters, exactly like the C# version.
const OuterWhitespace = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g

function isNullOrWhiteSpace(value: string | null | undefined): value is null | undefined {
  return value === null || value === undefined || value.trim() === ''
}

function trimOuter(value: string): string {
  return value.replace(OuterWhitespace, '')
}

export const InputNormalizer = Object.freeze({
  requiredText(
    value: string | null | undefined,
    parameterName: string,
    minimumLength = 1,
    maximumLength = Number.MAX_SAFE_INTEGER,
  ): string {
    if (isNullOrWhiteSpace(value)) {
      throw new ArgumentError('A non-empty value is required.', parameterName)
    }

    const normalized = trimOuter(value)
    if (normalized.length < minimumLength || normalized.length > maximumLength) {
      throw new ArgumentError(
        `The value must be between ${minimumLength} and ${maximumLength === Number.MAX_SAFE_INTEGER ? 2147483647 : maximumLength} characters after trimming.`,
        parameterName)
    }

    return normalized
  },

  optionalText(value: string | null | undefined, parameterName: string, maximumLength: number): string | null {
    if (isNullOrWhiteSpace(value)) {
      return null
    }

    const normalized = trimOuter(value)
    if (normalized.length > maximumLength) {
      throw new ArgumentError(`The value cannot exceed ${maximumLength} characters after trimming.`, parameterName)
    }

    return normalized
  },

  email(value: string | null | undefined, parameterName: string): string {
    return InputNormalizer.requiredText(value, parameterName, 3, 254).toLowerCase()
  },

  username(value: string | null | undefined, parameterName: string): string {
    const username = InputNormalizer.requiredText(value, parameterName, 3, 50).toLowerCase()
    if (!UsernamePattern.test(username)) {
      throw new ArgumentError(
        'Username may contain only letters, numbers, dots, underscores, and hyphens.',
        parameterName)
    }

    return username
  },

  password(
    value: string | null | undefined,
    parameterName: string,
    minimumLength: number,
    maximumLength: number,
    maximumUtf8Bytes: number,
  ): string {
    if (isNullOrWhiteSpace(value)
      || value.length < minimumLength
      || value.length > maximumLength
      || utf8ByteCount(value) > maximumUtf8Bytes) {
      throw new ArgumentError(
        `The value must be between ${minimumLength} and ${maximumLength} characters ` +
        `and no more than ${maximumUtf8Bytes} UTF-8 bytes.`,
        parameterName)
    }

    return value
  },

  optionalEmail(value: string | null | undefined, parameterName: string): string | null {
    return InputNormalizer.optionalText(value, parameterName, 254)?.toLowerCase() ?? null
  },

  optionalUppercase(value: string | null | undefined, parameterName: string, maximumLength: number): string | null {
    return InputNormalizer.optionalText(value, parameterName, maximumLength)?.toUpperCase() ?? null
  },

  /** C# Positive(int) overload. */
  positiveInt(value: number, parameterName: string): number {
    if (value <= 0) {
      throw new ArgumentOutOfRangeError(parameterName, 'The value must be greater than zero.')
    }

    return value
  },

  nonNegative(value: number, parameterName: string, precision: number, scale: number): number {
    if (value < 0) {
      throw new ArgumentOutOfRangeError(parameterName, 'The value cannot be negative.')
    }

    ensurePrecision(value, parameterName, precision, scale)
    return value
  },

  /** C# Positive(decimal, ...) overload. */
  positive(value: number, parameterName: string, precision: number, scale: number): number {
    if (value <= 0) {
      throw new ArgumentOutOfRangeError(parameterName, 'The value must be greater than zero.')
    }

    ensurePrecision(value, parameterName, precision, scale)
    return value
  },
})

function ensurePrecision(value: number, parameterName: string, precision: number, scale: number) {
  if (!DecimalPrecision.fits(value, precision, scale)) {
    throw new ArgumentOutOfRangeError(
      parameterName,
      `The value must fit within ${precision} digits and ${scale} decimal places.`)
  }
}
