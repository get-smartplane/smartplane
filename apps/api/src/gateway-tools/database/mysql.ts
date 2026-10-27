import { Redacted, Schema } from "effect"
import { createConnection } from "mysql2"
import type { SqlDriver, SqlOptions, SqlResult, SqlStatement } from "./driver"

type Connection = ReturnType<typeof createConnection>

/** mysql2's event payloads are loosely typed; decode the parts we use. */
const decodeFields = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))
const Row = Schema.Union([Schema.Array(Schema.Unknown), Schema.Struct({ affectedRows: Schema.Number })])
const decodeRow = Schema.decodeUnknownSync(Row)

const run = (connection: Connection, sql: string) =>
  new Promise<void>((resolve, reject) => connection.query(sql, (error: unknown) => (error ? reject(error) : resolve())))

/** Streams rows so memory stays bounded: rows past `maxRows` are counted as truncation and dropped. */
const stream = (connection: Connection, statement: SqlStatement, options: SqlOptions) =>
  new Promise<SqlResult>((resolve, reject) => {
    const rows: Array<ReadonlyArray<unknown>> = []
    let columns: ReadonlyArray<string> = []
    let truncated = false
    let affected: number | null = null
    connection.query({ sql: statement.sql, values: [...statement.params], rowsAsArray: true, timeout: options.timeoutMs })
      .on("fields", (fields: unknown) => void (columns = decodeFields(fields).map((field) => field.name)))
      .on("result", (result: unknown) => {
        const row = decodeRow(result)
        if ("affectedRows" in row) affected = row.affectedRows
        else if (rows.length < options.maxRows) rows.push(row)
        else truncated = true
      })
      .on("error", reject)
      .on("end", () => resolve({ columns, rows, truncated, rowCount: affected ?? rows.length }))
  })

/**
 * Session setup run before the statement. DDL (`DROP`, `ALTER`, ...) implicitly commits the open
 * transaction and continues outside it, so `START TRANSACTION READ ONLY` alone is not enough: the session
 * default must be read-only too. Both modes set it explicitly so a pooled connection never carries the
 * previous call's mode.
 */
export const sessionSetup = (options: SqlOptions): ReadonlyArray<string> => {
  const mode = options.readOnly ? "READ ONLY" : "READ WRITE"
  return [
    `SET SESSION MAX_EXECUTION_TIME = ${Math.floor(options.timeoutMs)}`,
    `SET SESSION TRANSACTION ${mode}`,
    `START TRANSACTION ${mode}`
  ]
}

/**
 * MySQL via mysql2 over `cloudflare:sockets` (nodejs_compat). `disableEval` is required on Workers;
 * `multipleStatements` stays off so a statement cannot end the read-only transaction early.
 */
export const mysqlDriver: SqlDriver = {
  execute: async (connectionString, statement, options) => {
    const connection = createConnection({
      uri: Redacted.value(connectionString),
      disableEval: true,
      multipleStatements: false,
      connectTimeout: options.timeoutMs,
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true
    })
    try {
      for (const sql of sessionSetup(options)) await run(connection, sql)
      const result = await stream(connection, statement, options)
      await run(connection, "COMMIT")
      return result
    } finally {
      connection.destroy()
    }
  }
}
