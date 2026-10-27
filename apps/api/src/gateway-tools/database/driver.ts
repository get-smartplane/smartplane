import type { DatabaseEngine } from "@pc/domain"
import { Context, type Redacted } from "effect"

export type SqlParam = string | number | boolean | null

export interface SqlStatement {
  readonly sql: string
  readonly params: ReadonlyArray<SqlParam>
}

export interface SqlOptions {
  /** Enforced by the database: the statement runs inside a read-only transaction. */
  readonly readOnly: boolean
  readonly maxRows: number
  readonly timeoutMs: number
}

export interface SqlResult {
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<ReadonlyArray<unknown>>
  /** More rows existed than `maxRows`; only the first `maxRows` were read. */
  readonly truncated: boolean
  /** Rows affected (or returned) as reported by the server, when it reports one. */
  readonly rowCount: number | null
}

/**
 * One database engine, reached with a connection string over TCP. Drivers run exactly one statement per
 * call (no multi-statement batches) on a fresh connection that is closed afterwards.
 */
export interface SqlDriver {
  readonly execute: (connection: Redacted.Redacted<string>, statement: SqlStatement, options: SqlOptions) => Promise<SqlResult>
}

export class SqlDrivers extends Context.Service<SqlDrivers, { readonly [E in DatabaseEngine]: SqlDriver }>()("api/gateway-tools/SqlDrivers") {}
