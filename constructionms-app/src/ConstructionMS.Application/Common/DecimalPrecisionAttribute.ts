import Decimal from 'decimal.js'

/** Validates that a decimal fits a database precision and scale without rounding. */
export const DecimalPrecision = Object.freeze({
  fits(value: Decimal.Value, precision: number, scale: number): boolean {
    const number = new Decimal(value)
    if (!number.isFinite()) return false
    const maximumExclusive = new Decimal(10).pow(precision - scale)
    return number.gt(maximumExclusive.neg())
      && number.lt(maximumExclusive)
      && number.eq(number.toDecimalPlaces(scale, Decimal.ROUND_DOWN))
  },

  formatErrorMessage(name: string, precision: number, scale: number): string {
    return `${name} must fit within ${precision} digits with no more than ${scale} decimal places.`
  },
})
