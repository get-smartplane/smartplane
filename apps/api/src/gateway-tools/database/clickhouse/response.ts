import { Option, Schema } from "effect"
import type { SqlResult } from "../driver"
import { ClickHouseError } from "./errors"

/** ClickHouse's `JSONCompact` output: column metadata and rows as arrays. */
const CompactJson = Schema.fromJsonString(Schema.Struct({
  meta: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String })),
  data: Schema.Array(Schema.Array(Schema.Unknown))
}))
const decodeCompact = Schema.decodeUnknownOption(CompactJson)

/** The `X-ClickHouse-Summary` header; counters are JSON strings (UInt64). */
const Summary = Schema.fromJsonString(Schema.Struct({ written_rows: Schema.NumberFromString }))
const decodeSummary = Schema.decodeUnknownOption(Summary)

const writtenRows = (summary: string | null): number | null => Option.getOrNull(Option.map(decodeSummary(summary), (counts) => counts.written_rows))

/**
 * A successful reply. Statements without a result set (INSERT, CREATE, ...) answer with an empty body. A body
 * that is not `JSONCompact` means the statement chose its own `FORMAT`, which the gateway cannot read.
 */
export const sqlResultOf = (body: string, summary: string | null, maxRows: number): SqlResult => {
  if (body.trim() === "") return { columns: [], rows: [], truncated: false, rowCount: writtenRows(summary) }
  const decoded = decodeCompact(body)
  if (Option.isNone(decoded)) {
    throw new ClickHouseError({ code: null, message: "ClickHouse answered in a format other than JSONCompact; remove the statement's FORMAT clause" })
  }
  const { meta, data } = decoded.value
  return {
    columns: meta.map((column) => column.name),
    rows: data.slice(0, maxRows),
    truncated: data.length > maxRows,
    rowCount: Math.min(data.length, maxRows)
  }
}
