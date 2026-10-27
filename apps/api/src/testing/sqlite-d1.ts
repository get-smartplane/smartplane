import { readdirSync, readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

const migrationsDir = new URL("../../migrations/", import.meta.url)

const meta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
    private readonly params: ReadonlyArray<unknown> = []
  ) {}

  bind(...values: Array<unknown>) {
    return new Statement(this.db, this.query, values)
  }

  rows(): Array<Record<string, unknown>> {
    return this.db.prepare(this.query).all(...this.params.map((value) => value ?? null))
  }

  async all() {
    return { success: true as const, meta, results: this.rows() }
  }

  async run() {
    return this.all()
  }

  async raw() {
    return this.rows().map((row) => Object.values(row))
  }

  async first() {
    return this.rows()[0] ?? null
  }
}

/**
 * Just enough of `D1Database`, over node:sqlite, for `@effect/sql-d1` to run the real migrations and
 * queries in tests. D1 is SQLite, so SQL behaviour (constraints, RETURNING, triggers) carries over.
 */
export const makeSqliteD1 = () => {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, migrationsDir), "utf8"))
  }
  const fake = {
    prepare: (query: string) => new Statement(db, query),
    batch: async (statements: ReadonlyArray<Statement>) => {
      db.exec("BEGIN")
      try {
        const results = statements.map((statement) => ({ success: true as const, meta, results: statement.rows() }))
        db.exec("COMMIT")
        return results
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    exec: async (query: string) => {
      db.exec(query)
      return { count: 0, duration: 0 }
    }
  }
  return { db, fake }
}
