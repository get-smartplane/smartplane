import { Redacted } from "effect"
import postgres from "postgres"
import type { SqlDriver, SqlResult } from "./driver"

/**
 * PostgreSQL via postgres.js, which uses `cloudflare:sockets` on Workers (its `workerd` export). The
 * statement runs with the extended protocol (`simple: false`), which refuses multi-statement strings, so
 * an agent cannot `COMMIT` its way out of the read-only transaction.
 */
export const postgresDriver: SqlDriver = {
  execute: async (connection, statement, options) => {
    const sql = postgres(Redacted.value(connection), {
      max: 1,
      prepare: false,
      fetch_types: false,
      connect_timeout: Math.ceil(options.timeoutMs / 1000),
      onnotice: () => {}
    })
    try {
      return await sql.begin(options.readOnly ? "read only" : "read write", async (tx): Promise<SqlResult> => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${Math.floor(options.timeoutMs)}`)
        let rows: ReadonlyArray<ReadonlyArray<unknown>> = []
        let truncated = false
        const query = tx.unsafe(statement.sql, [...statement.params], { prepare: false }).values()
        const done = await query.cursor(options.maxRows + 1, (batch) => {
          truncated = batch.length > options.maxRows
          rows = batch.slice(0, options.maxRows)
          // Stop after the first batch: the cursor never reads more than maxRows + 1 rows.
          return sql.CLOSE
        })
        return { columns: (done.columns ?? []).map((column) => column.name), rows, truncated, rowCount: done.count ?? null }
      })
    } finally {
      await sql.end({ timeout: 1 })
    }
  }
}
