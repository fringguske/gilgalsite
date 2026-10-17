import Decimal from 'decimal.js'

/**
 * Exact base-10 arithmetic replacing C# `decimal`. Database numerics arrive as JS
 * numbers (lossless at the 18,2 / 18,3 scales used here); do every sum, product,
 * comparison and rounding through these helpers, never with raw `+ - * /` on
 * floats, then convert back with `toNumber` for DTOs and inserts.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN })

export { Decimal }

export function dec(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value ?? 0)
}

export function sum(values: Iterable<Decimal.Value | null | undefined>): Decimal {
  let total = new Decimal(0)
  for (const value of values) total = total.plus(value ?? 0)
  return total
}

/** C# `Math.Round(value, digits)` / `decimal.Round(value, digits)`: banker's rounding. */
export function round(value: Decimal.Value, digits = 0): Decimal {
  return new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_EVEN)
}

/** C# `Math.Round(value, digits, MidpointRounding.AwayFromZero)`. */
export function roundAwayFromZero(value: Decimal.Value, digits = 0): Decimal {
  return new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP)
}

export function toNumber(value: Decimal.Value): number {
  return new Decimal(value).toNumber()
}

export function eq(a: Decimal.Value, b: Decimal.Value): boolean {
  return new Decimal(a).eq(b)
}

export function cmp(a: Decimal.Value, b: Decimal.Value): -1 | 0 | 1 {
  return new Decimal(a).cmp(b) as -1 | 0 | 1
}

/**
 * C# `value.ToString("N{digits}")` under the invariant/en-US culture: thousands separators,
 * fixed decimals, midpoint rounded away from zero (how .NET formats decimals).
 */
export function formatNumber(value: Decimal.Value, digits = 2): string {
  const rounded = new Decimal(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP)
  const [integer, fraction] = rounded.abs().toFixed(digits).split('.')
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = rounded.isNegative() && !rounded.isZero() ? '-' : ''
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}
