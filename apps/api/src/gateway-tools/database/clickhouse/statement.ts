import type { SqlParam } from "../driver"

/** Statements a read-only grant may send. `readonly=1` is what enforces it; this list refuses early and plainly. */
const readStatements: ReadonlySet<string> = new Set(["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "EXISTS"])

/** Leading whitespace, `--`/`#` line comments, block comments and opening parentheses. */
const preamble = /^(?:\s+|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\()*/

export const leadingKeyword = (sql: string): string => (/^[A-Za-z]+/.exec(sql.replace(preamble, ""))?.[0] ?? "").toUpperCase()

export const isReadStatement = (sql: string): boolean => readStatements.has(leadingKeyword(sql))

/**
 * ClickHouse query parameters are named; the tool's `params` are positional, so `params[0]` is `{p1:Type}`.
 * Values travel as `param_p1=…` in ClickHouse's escaped text format, where `\N` is NULL.
 */
export const parameterName = (index: number): string => `p${index + 1}`

const escapes: Readonly<Record<string, string>> = { "\\": "\\\\", "\t": "\\t", "\n": "\\n", "\r": "\\r", "\0": "\\0" }
const escaped = (value: string): string => value.replace(/[\\\t\n\r\0]/g, (char) => escapes[char] ?? char)

export const encodeParameter = (value: SqlParam): string => {
  if (value === null) return "\\N"
  if (typeof value === "string") return escaped(value)
  return String(value)
}

export const queryParameters = (params: ReadonlyArray<SqlParam>): ReadonlyArray<readonly [string, string]> =>
  params.map((value, index) => [`param_${parameterName(index)}`, encodeParameter(value)])
