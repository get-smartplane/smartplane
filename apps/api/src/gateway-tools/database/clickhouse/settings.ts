import type { SqlOptions } from "../driver"

export const timeoutSeconds = (options: SqlOptions): number => Math.max(1, Math.ceil(options.timeoutMs / 1000))

/**
 * Per-request ClickHouse settings, sent as URL parameters.
 *
 * - `readonly=1` on every read-only call: the server refuses writes, DDL and any further settings change, so
 *   a statement cannot lift the limits below. It does not refuse read-only table functions (`url()`, `s3()`,
 *   `remote()`, ...): the driver allows only row generators (`tableFunctionRefusal`), and the login should lack
 *   the `URL`, `S3`, `REMOTE`, `FILE` and similar source privileges as well.
 * - `max_execution_time` and `max_result_rows` (with `break`) match the other engines' timeout and row cap.
 *   `break` stops at a block boundary, so the driver still trims to `maxRows`; `limit` asks for exactly one
 *   row more than the cap, which is how truncation shows (a read-only statement may lower `limit`, not lift
 *   `max_result_rows`).
 * - `wait_end_of_query=1` buffers the reply, so a failure mid-query is an HTTP error, not a cut-off body.
 * - 64-bit integers and decimals come back as JSON strings, so no precision is lost.
 */
export const requestSettings = (options: SqlOptions): ReadonlyArray<readonly [string, string]> => {
  const rows = String(options.maxRows + 1)
  return [
    ...(options.readOnly ? [["readonly", "1"] as const] : []),
    ["max_execution_time", String(timeoutSeconds(options))],
    ["max_result_rows", rows],
    ["result_overflow_mode", "break"],
    ["limit", rows],
    ["wait_end_of_query", "1"],
    ["default_format", "JSONCompact"],
    ["output_format_json_quote_64bit_integers", "1"],
    ["output_format_json_quote_decimals", "1"]
  ]
}
