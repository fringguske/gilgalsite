import { ArgumentError } from '@/ConstructionMS.Application/Common/Exceptions'

// Numbers written without a country code are read as Kenyan mobile numbers.
const DefaultCountryCode = '254'
const KenyanMobilePattern = /^[17]\d{8}$/
const E164Pattern = /^\+[1-9]\d{7,14}$/
const Separators = /[\s\-.()]/g

/**
 * Phone numbers are stored in E.164 form (+254712345678) so that SMS codes can be sent to them.
 * Accepts 0712 345 678, 712345678, 254712345678, +254 712 345 678 and other countries' numbers
 * written with a leading + (or 00).
 */
export const PhoneNumbers = Object.freeze({
  /** Returns the E.164 form, or null when the value is not a number an SMS can be sent to. */
  tryNormalize(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null
    }

    let compact = value.replace(Separators, '')
    if (compact.startsWith('00')) {
      compact = `+${compact.slice(2)}`
    }

    let national: string
    if (compact.startsWith(`+${DefaultCountryCode}`)) {
      national = compact.slice(DefaultCountryCode.length + 1)
    } else if (compact.startsWith('+')) {
      return E164Pattern.test(compact) ? compact : null
    } else if (compact.startsWith(DefaultCountryCode)) {
      national = compact.slice(DefaultCountryCode.length)
    } else {
      national = compact
    }

    // "0712..." and the common "+254 0712..." both carry a trunk 0 that E.164 drops.
    if (national.startsWith('0')) {
      national = national.slice(1)
    }

    return KenyanMobilePattern.test(national) ? `+${DefaultCountryCode}${national}` : null
  },

  normalize(value: string | null | undefined, parameterName: string): string {
    const normalized = PhoneNumbers.tryNormalize(value)
    if (normalized === null) {
      throw new ArgumentError(
        'Enter a mobile number that can receive SMS, such as 0712 345 678 or +254 712 345 678.',
        parameterName)
    }

    return normalized
  },

  /** "+254712345678" -> "+254••••••678": enough for the person to recognise their own number. */
  mask(e164: string): string {
    return `${e164.slice(0, 4)}${'•'.repeat(Math.max(e164.length - 7, 0))}${e164.slice(-3)}`
  },
})
