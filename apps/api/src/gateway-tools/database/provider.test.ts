import { assert, describe, it } from "@effect/vitest"
import { type Action, ResourceId } from "@pc/domain"
import { Effect, Layer, Redacted } from "effect"
import { actorOf } from "../../audit/actor"
import { userPrincipal } from "../../testing/fixtures"
import { accessOf, fakeSecrets, grantOf, resourceOf } from "../../testing/gateway-fakes"
import { type SqlDriver, SqlDrivers, type SqlOptions, type SqlStatement } from "./driver"
import { makeDatabaseProvider, MaxRows } from "./provider"
import { DatabaseRunner } from "./runner"

const secretId = ResourceId.make("res_dbsecret1")
const connection = "postgres://agent:hunter2@db.internal:5432/app"

interface Executed {
  readonly connection: string
  readonly statement: SqlStatement
  readonly options: SqlOptions
}

const recordingDriver = (executed: Array<Executed>, fail?: string): SqlDriver => ({
  execute: async (secret, statement, options) => {
    executed.push({ connection: Redacted.value(secret), statement, options })
    if (fail !== undefined) throw new Error(fail)
    return { columns: ["id"], rows: [[1n]], truncated: false, rowCount: 1 }
  }
})

const database = (readOnly: boolean) =>
  resourceOf("res_warehouse", "Warehouse", { kind: "database", engine: "postgres", connectionSecretId: secretId, readOnly })

const toolsFor = (readOnly: boolean, action: Action, executed: Array<Executed>, fail?: string) =>
  Effect.gen(function*() {
    const provider = yield* makeDatabaseProvider
    const principal = userPrincipal()
    const tools = yield* provider.tools({ principal, actor: actorOf(principal), access: accessOf(grantOf(database(readOnly), action)) })
    return new Map(tools.map((tool) => [tool.definition.name, tool]))
  }).pipe(Effect.provide(DatabaseRunner.layer.pipe(Layer.provide([
    fakeSecrets({ [secretId]: connection }),
    Layer.succeed(SqlDrivers, { postgres: recordingDriver(executed, fail), mysql: recordingDriver(executed, fail), clickhouse: recordingDriver(executed, fail) })
  ]))))

const query = (readOnly: boolean, action: Action, executed: Array<Executed>, fail?: string) =>
  Effect.gen(function*() {
    const tool = (yield* toolsFor(readOnly, action, executed, fail)).get("warehouse__query")
    if (tool === undefined) return yield* Effect.die("expected warehouse__query")
    const prepared = yield* tool.prepare({ sql: "DELETE FROM orders WHERE id = $1", params: [7] })
    return { prepared, result: yield* prepared.execute.pipe(Effect.result) }
  })

describe("database gateway tools", () => {
  it.effect("exposes <slug>__query and <slug>__schema to `use` grants", () =>
    Effect.gen(function*() {
      const tools = yield* toolsFor(true, "use", [])
      assert.deepStrictEqual([...tools.keys()], ["warehouse__query", "warehouse__schema"])
      assert.deepStrictEqual([...(yield* toolsFor(true, "read", [])).keys()], [])
    }))

  it.effect("runs read-only unless the resource allows writes and the caller holds `write`", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<readonly [boolean, Action, boolean]> = [
        [true, "use", true],
        [true, "admin", true],
        [false, "use", true],
        [false, "write", false]
      ]
      for (const [resourceReadOnly, action, expected] of cases) {
        const executed: Array<Executed> = []
        const { prepared } = yield* query(resourceReadOnly, action, executed)
        assert.strictEqual(executed[0]?.options.readOnly, expected, `${resourceReadOnly}/${action}`)
        assert.deepStrictEqual(prepared.arguments, { sql: "DELETE FROM orders WHERE id = $1", params: [7], readOnly: expected })
      }
    }))

  it.effect("injects the connection string, caps rows and serialises bigints", () =>
    Effect.gen(function*() {
      const executed: Array<Executed> = []
      const { prepared, result } = yield* query(true, "use", executed)
      assert.strictEqual(executed[0]?.connection, connection)
      assert.strictEqual(executed[0]?.options.maxRows, MaxRows)
      assert.notInclude(JSON.stringify(prepared.arguments), "hunter2")
      assert.strictEqual(result._tag, "Success")
      if (result._tag === "Success") assert.deepStrictEqual(JSON.parse(String(result.success.content[0]?.text)).rows, [["1"]])
    }))

  it.effect("never echoes the connection password in driver errors", () =>
    Effect.gen(function*() {
      const { result } = yield* query(true, "use", [], `connect failed for ${connection} (password hunter2)`)
      assert.strictEqual(result._tag, "Failure")
      if (result._tag === "Failure") assert.notInclude(result.failure.message, "hunter2")
    }))

  it.effect("schema introspection always runs read-only", () =>
    Effect.gen(function*() {
      const executed: Array<Executed> = []
      const tool = (yield* toolsFor(false, "write", executed)).get("warehouse__schema")
      if (tool === undefined) return yield* Effect.die("expected warehouse__schema")
      yield* Effect.flatMap(tool.prepare({ table: "orders" }), (call) => call.execute)
      assert.isTrue(executed[0]?.options.readOnly)
      assert.deepStrictEqual(executed[0]?.statement.params, ["orders"])
    }))

  it.effect("rejects malformed arguments before anything runs", () =>
    Effect.gen(function*() {
      const tool = (yield* toolsFor(true, "use", [])).get("warehouse__query")
      if (tool === undefined) return yield* Effect.die("expected warehouse__query")
      const error = yield* Effect.flip(tool.prepare({ sql: "", params: [{}] }))
      assert.strictEqual(error._tag, "InvalidInput")
    }))
})
