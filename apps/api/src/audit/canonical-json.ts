/** JSON with object keys sorted at every depth, so a hash never depends on key insertion order. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value))

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => [key, sortKeys(inner)])
  )
}
