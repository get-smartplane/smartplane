import { textResult, type ToolResult } from "../../mcp/sdk"
import type { SqlResult } from "./driver"

const MaxTextLength = 1_000_000

/** JSON for any driver value: bigints as strings, binary as a size note. */
const replacer = (_key: string, value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`
  return value
}

export const formatSqlResult = (result: SqlResult): ToolResult => {
  const text = JSON.stringify({
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    ...(result.truncated ? { truncated: `only the first ${result.rows.length} rows are shown; add a LIMIT or narrow the query` } : {})
  }, replacer)
  return textResult(text.length > MaxTextLength ? `${text.slice(0, MaxTextLength)}\n[output cut at ${MaxTextLength} characters]` : text)
}
