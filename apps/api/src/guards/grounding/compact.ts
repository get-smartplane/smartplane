export interface ShrinkLimits {
  readonly maxString: number
  readonly maxArray: number
  readonly maxKeys: number
  readonly maxDepth: number
}

const defaults: ShrinkLimits = { maxString: 400, maxArray: 20, maxKeys: 40, maxDepth: 6 }

/**
 * A copy of a JSON-like value that fits a token budget: long strings are cut (noting how much), long
 * arrays and objects keep their first entries, deep nesting is elided. Shapes and keys survive, so a
 * classifier still sees what kind of call it is.
 */
export const shrinkJson = (value: unknown, limits: Partial<ShrinkLimits> = {}, depth = 0): unknown => {
  const { maxString, maxArray, maxKeys, maxDepth } = { ...defaults, ...limits }
  if (typeof value === "string") return value.length <= maxString ? value : `${value.slice(0, maxString)}…(+${value.length - maxString} chars)`
  if (value === null || typeof value !== "object") return typeof value === "bigint" ? String(value) : value
  if (depth >= maxDepth) return Array.isArray(value) ? `[${value.length} items]` : "{…}"
  const next = (item: unknown) => shrinkJson(item, limits, depth + 1)
  if (Array.isArray(value)) {
    const kept = value.slice(0, maxArray).map(next)
    return value.length > maxArray ? [...kept, `…(+${value.length - maxArray} items)`] : kept
  }
  const entries = Object.entries(value)
  const kept = Object.fromEntries(entries.slice(0, maxKeys).map(([key, item]) => [key, next(item)]))
  return entries.length > maxKeys ? { ...kept, "…": `+${entries.length - maxKeys} keys` } : kept
}

/** One-line JSON for display and prompts, cut to `max` characters. */
export const compactJson = (value: unknown, max = 240): string => {
  const text = JSON.stringify(shrinkJson(value, { maxString: 80, maxArray: 5, maxKeys: 12, maxDepth: 4 })) ?? "null"
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
