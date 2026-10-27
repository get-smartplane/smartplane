import { Redacted } from "effect"
import { describe, expect, it, vi } from "vitest"

const issued: Array<string> = []

vi.mock("mysql2", () => ({
  createConnection: () => ({
    query: (sql: string | { readonly sql: string }, callback?: (error: unknown) => void) => {
      issued.push(typeof sql === "string" ? sql : sql.sql)
      if (callback !== undefined) {
        callback(null)
        return undefined
      }
      // A streamed query with no rows: only "end" ever fires.
      const query = {
        on: (event: string, listener: () => void) => {
          if (event === "end") queueMicrotask(listener)
          return query
        }
      }
      return query
    },
    destroy: () => {}
  })
}))

const { mysqlDriver, sessionSetup } = await import("./mysql")

const options = (readOnly: boolean) => ({ readOnly, maxRows: 10, timeoutMs: 5_000 })

describe("mysql driver", () => {
  it("makes the session read-only before a read-only transaction, so DDL cannot commit out of it", async () => {
    issued.length = 0
    await mysqlDriver.execute(Redacted.make("mysql://u:p@db/app"), { sql: "DROP TABLE orders", params: [] }, options(true))
    expect(issued).toEqual([
      "SET SESSION MAX_EXECUTION_TIME = 5000",
      "SET SESSION TRANSACTION READ ONLY",
      "START TRANSACTION READ ONLY",
      "DROP TABLE orders",
      "COMMIT"
    ])
  })

  it("sets the session mode explicitly in both directions so a reused connection never inherits it", () => {
    expect(sessionSetup(options(false))).toContain("SET SESSION TRANSACTION READ WRITE")
    expect(sessionSetup(options(true))).toContain("SET SESSION TRANSACTION READ ONLY")
    expect(sessionSetup(options(false))).not.toContain("SET SESSION TRANSACTION READ ONLY")
  })
})
