const cultureCollator = new Intl.Collator('en', { sensitivity: 'variant' })

/**
 * LINQ-to-objects `OrderBy(x => x.SomeString)`: the default culture-aware comparer,
 * with null ordered before every string.
 */
export function compareCultureStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  return cultureCollator.compare(a, b)
}

/** `string.CompareOrdinal` / `StringComparer.Ordinal`. */
export function compareOrdinalStrings(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` */
export function equalsIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  return a.toUpperCase() === b.toUpperCase()
}
