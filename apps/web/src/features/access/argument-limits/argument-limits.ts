import { type ArgumentConstraints, ArgumentPath, type ArgumentValue } from "@pc/domain"
import { Schema } from "effect"
import type { ArgumentInfo } from "./input-schema"

/** One editor row: "only allow `tool` when `path` is one of `values`". Values stay text until submit. */
export interface ArgumentLimitDraft {
  readonly key: number
  readonly tool: string
  readonly path: string
  readonly values: ReadonlyArray<string>
}

export const emptyLimit = (key: number, tool = ""): ArgumentLimitDraft => ({ key, tool, path: "", values: [] })

export const isBlank = (limit: ArgumentLimitDraft) => limit.tool === "" && limit.path.trim() === "" && limit.values.length === 0

export const isIncomplete = (limit: ArgumentLimitDraft) => !isBlank(limit) && (limit.tool === "" || limit.path.trim() === "" || limit.values.length === 0)

const isPath = Schema.is(ArgumentPath)

/** A typed path the schema would refuse (`a..b`, `$.a`, spaces), so the row can say so before submit. */
export const isMalformedPath = (path: string) => path.trim() !== "" && !isPath(path.trim())

/** The type values are sent as: the input's declared type, or `unknown` when no schema lists the path (MCP servers). */
export type ValueType = ArgumentInfo["valueType"] | "unknown"

const bareNumber = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const quoted = /^"(.*)"$/s

/**
 * Matching is exact and typed: `7` only matches the number 7. Where the input's type is known, text becomes
 * that type. Where it is not, a bare number or `true`/`false` becomes a number or boolean and anything in
 * double quotes stays text (`"7"` matches the string, `007` stays a string since it is not a JSON number).
 */
export const coerce = (value: string, valueType: ValueType): ArgumentValue => {
  const text = value.trim()
  switch (valueType) {
    case "string":
      return value
    case "number":
      return text !== "" && Number.isFinite(Number(text)) ? Number(text) : value
    case "boolean":
      return text === "true" || text === "false" ? text === "true" : value
    case "unknown": {
      const match = quoted.exec(text)
      if (match?.[1] !== undefined) return match[1]
      if (text === "true" || text === "false") return text === "true"
      return bareNumber.test(text) ? Number(text) : value
    }
  }
}

export type ValueTypeOf = (tool: string, path: string) => ValueType

/**
 * `conditions.arguments` from the rows, rows for the same tool and path merged. Untouched rows are dropped;
 * half-filled ones pass through so the schema reports them.
 */
export const toArgumentInput = (limits: ReadonlyArray<ArgumentLimitDraft>, valueTypeOf: ValueTypeOf): { readonly arguments?: Record<string, Record<string, ReadonlyArray<ArgumentValue>>> } => {
  const filled = limits.filter((limit) => !isBlank(limit))
  if (filled.length === 0) return {}
  const constraints: Record<string, Record<string, ReadonlyArray<ArgumentValue>>> = {}
  for (const { tool, path, values } of filled) {
    const paths = (constraints[tool] ??= {})
    const typed = values.map((value) => coerce(value, valueTypeOf(tool, path.trim())))
    paths[path.trim()] = [...new Set([...(paths[path.trim()] ?? []), ...typed])]
  }
  return { arguments: constraints }
}

/** The rows a stored constraint becomes, for reading it back in plain words. */
export const limitsOf = (constraints: ArgumentConstraints | undefined): ReadonlyArray<{ readonly tool: string; readonly path: string; readonly values: ReadonlyArray<ArgumentValue> }> =>
  Object.entries(constraints ?? {}).flatMap(([tool, paths]) => Object.entries(paths).map(([path, values]) => ({ tool, path, values })))

/** Text in quotes, numbers and booleans bare: exactly how the backend will compare them. */
export const formatValues = (values: ReadonlyArray<ArgumentValue>): string => values.map((value) => (typeof value === "string" ? `“${value}”` : String(value))).join(", ")
