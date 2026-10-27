import { assert, describe, it } from "@effect/vitest"
import { Redacted } from "effect"
import { fakeFetch, type FakeReply } from "../../../testing/fake-fetch"
import type { SqlOptions, SqlStatement } from "../driver"
import { makeClickHouseDriver } from "./driver"

const connection = Redacted.make("https://agent:hunter2@ch.example.com:8443/analytics")
const readOnly: SqlOptions = { readOnly: true, maxRows: 2, timeoutMs: 10_000 }
const readWrite: SqlOptions = { ...readOnly, readOnly: false }

const compact = (data: ReadonlyArray<ReadonlyArray<unknown>>) =>
  JSON.stringify({ meta: [{ name: "id", type: "UInt64" }, { name: "note", type: "Nullable(String)" }], data, rows: data.length })

const run = async (statement: SqlStatement, options: SqlOptions, reply: FakeReply = { body: compact([]) }) => {
  const requests: Array<Request> = []
  const result = await makeClickHouseDriver(fakeFetch(reply, requests)).execute(connection, statement, options)
  return { result, requests }
}

const settingsOf = (request: Request | undefined) => Object.fromEntries(new URL(request?.url ?? "http://missing").searchParams)

describe("ClickHouse driver", () => {
  it("decodes JSONCompact into the result shape and trims to maxRows", async () => {
    const { result } = await run({ sql: "SELECT id, note FROM orders", params: [] }, readOnly, { body: compact([["1", "a"], ["2", null], ["3", "c"]]) })
    assert.deepStrictEqual(result, { columns: ["id", "note"], rows: [["1", "a"], ["2", null]], truncated: true, rowCount: 2 })
  })

  it("reads written rows from the summary when a write returns no body", async () => {
    const { result } = await run({ sql: "INSERT INTO orders VALUES (1, 'a')", params: [] }, readWrite, {
      body: "",
      headers: { "X-ClickHouse-Summary": JSON.stringify({ read_rows: "0", written_rows: "1" }) }
    })
    assert.deepStrictEqual(result, { columns: [], rows: [], truncated: false, rowCount: 1 })
  })

  it("sends readonly=1 and the limits on every read-only call", async () => {
    for (const statement of [{ sql: "SELECT 1", params: [] }, { sql: "  -- why\n/* c */ (WITH x AS (SELECT 1) SELECT * FROM x)", params: [] }]) {
      const { requests } = await run(statement, readOnly)
      const settings = settingsOf(requests[0])
      assert.strictEqual(settings.readonly, "1")
      assert.strictEqual(settings.max_execution_time, "10")
      assert.strictEqual(settings.max_result_rows, "3")
      assert.strictEqual(settings.result_overflow_mode, "break")
      assert.strictEqual(settings.database, "analytics")
    }
  })

  it("keeps the limits but not readonly for a read-write grant", async () => {
    const settings = settingsOf((await run({ sql: "INSERT INTO t VALUES (1)", params: [] }, readWrite, { body: "" })).requests[0])
    assert.isUndefined(settings.readonly)
    assert.strictEqual(settings.max_execution_time, "10")
    assert.strictEqual(settings.max_result_rows, "3")
  })

  it("refuses statements outside the read allow-list before calling the server", async () => {
    for (const sql of ["INSERT INTO t VALUES (1)", "/* SELECT */ DROP TABLE t", "ALTER TABLE t DELETE WHERE 1", "SET readonly = 0", "SYSTEM SHUTDOWN", ""]) {
      const requests: Array<Request> = []
      const failure = await makeClickHouseDriver(fakeFetch({ body: compact([]) }, requests)).execute(connection, { sql, params: [] }, readOnly).then(
        () => assert.fail(`expected ${sql} to be refused`),
        (error: unknown) => error
      )
      assert.instanceOf(failure, Error)
      assert.include(String(failure), "read-only grant")
      assert.lengthOf(requests, 0, sql)
    }
  })

  it("passes params as named {pN:Type} query parameters in ClickHouse's escaped format", async () => {
    const { requests } = await run({ sql: "SELECT {p1:String}, {p2:Nullable(String)}, {p3:UInt32}, {p4:Bool}", params: ["a\\b\tc\nd'", null, 42, true] }, readOnly)
    const settings = settingsOf(requests[0])
    assert.deepStrictEqual([settings.param_p1, settings.param_p2, settings.param_p3, settings.param_p4], ["a\\\\b\\tc\\nd'", "\\N", "42", "true"])
    assert.strictEqual(await requests[0]?.text(), "SELECT {p1:String}, {p2:Nullable(String)}, {p3:UInt32}, {p4:Bool}")
  })

  it("sends credentials in headers only, never in the URL", async () => {
    const { requests } = await run({ sql: "SELECT 1", params: [] }, readOnly)
    const request = requests[0]
    assert.strictEqual(request?.method, "POST")
    assert.notInclude(request?.url ?? "", "hunter2")
    assert.notInclude(request?.url ?? "", "agent")
    assert.strictEqual(request?.headers.get("X-ClickHouse-User"), "agent")
    assert.strictEqual(request?.headers.get("X-ClickHouse-Key"), "hunter2")
  })

  it("refuses a reply in a format it cannot read", async () => {
    const failure = await run({ sql: "SELECT 1 FORMAT CSV", params: [] }, readOnly, { body: "1\n" }).catch((error: unknown) => error)
    assert.include(String(failure), "FORMAT")
  })
})
