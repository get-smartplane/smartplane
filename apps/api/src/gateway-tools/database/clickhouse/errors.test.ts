import { assert, describe, it } from "@effect/vitest"
import { type DatabaseConfig, ResourceId } from "@pc/domain"
import { Effect, Layer, Tracer } from "effect"
import { actorOf } from "../../../audit/actor"
import { fakeFetch, type FakeReply } from "../../../testing/fake-fetch"
import { userPrincipal } from "../../../testing/fixtures"
import { fakeSecrets, resourceOf } from "../../../testing/gateway-fakes"
import { type SqlDriver, SqlDrivers } from "../driver"
import { DatabaseRunner } from "../runner"
import { makeClickHouseDriver } from "./driver"
import { clickHouseError } from "./errors"

const exception = (code: number, detail: string, name: string) => `Code: ${code}. DB::Exception: ${detail}. (${name}) (version 24.8.4.13 (official build))\n`
const failure = (status: number, code: number, detail: string, name: string) =>
  clickHouseError({ status, codeHeader: String(code), body: exception(code, detail, name), user: "agent", timeoutSeconds: 10 })

describe("ClickHouse error mapping", () => {
  it("keeps the code, name and detail of ordinary errors", () => {
    const error = failure(404, 60, "Unknown table expression identifier 'nope'", "UNKNOWN_TABLE")
    assert.strictEqual(error.code, 60)
    assert.strictEqual(error.message, "ClickHouse error 60 (UNKNOWN_TABLE): Unknown table expression identifier 'nope'")
  })

  it("never repeats what the server says about the login on authentication failures", () => {
    for (const code of [192, 193, 194, 516]) {
      const error = failure(403, code, "agent: Authentication failed: password is incorrect, or there is no user with such name", "AUTHENTICATION_FAILED")
      assert.notInclude(error.message, "agent")
      assert.include(error.message, "rejected the login")
    }
  })

  it("explains read-only refusals and timeouts", () => {
    assert.strictEqual(
      failure(500, 164, "agent: Cannot execute query in readonly mode", "READONLY").message,
      "ClickHouse error 164 (READONLY): refused in read-only mode: Cannot execute query in readonly mode"
    )
    assert.include(failure(408, 159, "Timeout exceeded: elapsed 10001 ms, maximum: 10000 ms", "TIMEOUT_EXCEEDED").message, "longer than 10s")
  })

  it("falls back to the body code, then the HTTP status", () => {
    assert.strictEqual(clickHouseError({ status: 500, codeHeader: null, body: exception(62, "Syntax error", "SYNTAX_ERROR"), user: "u", timeoutSeconds: 10 }).code, 62)
    assert.strictEqual(clickHouseError({ status: 502, codeHeader: null, body: "Bad Gateway", user: "u", timeoutSeconds: 10 }).message, "ClickHouse error HTTP 502: Bad Gateway")
  })
})

const secretId = ResourceId.make("res_chsecret1")
const connection = "https://agent:hunter2@ch.example.com:8443/analytics"
const config: typeof DatabaseConfig.Type = { kind: "database", engine: "clickhouse", connectionSecretId: secretId, readOnly: true }
const resource = resourceOf("res_clickhouse", "Events", config)

const unused: SqlDriver = { execute: () => Promise.reject(new Error("not this engine")) }

/** Runs one statement through the runner and returns its failure message and every span it recorded. */
const runFailing = (reply: FakeReply, secret = connection) =>
  Effect.gen(function*() {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({ span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    } })
    const runner = yield* DatabaseRunner
    const statement = { sql: `SELECT '${secret}'`, params: [secret] }
    const error = yield* Effect.flip(runner.run(resource, config, actorOf(userPrincipal()), statement, { readOnly: true, maxRows: 10 })).pipe(Effect.withTracer(tracer))
    const recorded = JSON.stringify(
      spans.map((span) => ({ name: span.name, attributes: [...span.attributes], events: span.events, status: span.status })),
      (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value)
    )
    return { message: error.message, spans: recorded }
  }).pipe(Effect.provide(DatabaseRunner.layer.pipe(Layer.provide([
    fakeSecrets({ [secretId]: secret }),
    Layer.succeed(SqlDrivers, { postgres: unused, mysql: unused, clickhouse: makeClickHouseDriver(fakeFetch(reply)) })
  ]))))

describe("ClickHouse credentials", () => {
  const echoing = `Code: 516. DB::Exception: agent: Authentication failed for ${connection} with hunter2. (AUTHENTICATION_FAILED)`

  it.effect("never appear in errors or spans, whatever the server echoes", () =>
    Effect.gen(function*() {
      const replies: ReadonlyArray<FakeReply> = [
        { status: 403, body: echoing, headers: { "X-ClickHouse-Exception-Code": "516" } },
        { status: 400, body: `Code: 62. DB::Exception: Syntax error near '${connection}' hunter2. (SYNTAX_ERROR)` },
        { throws: new TypeError(`fetch failed: ${connection}`) }
      ]
      for (const reply of replies) {
        const { message, spans } = yield* runFailing(reply)
        assert.include(spans, "DatabaseRunner.run")
        for (const leaked of ["hunter2", connection]) {
          assert.notInclude(message, leaked)
          assert.notInclude(spans, leaked)
        }
      }
    }))

  it.effect("are not quoted when the connection secret is malformed", () =>
    Effect.gen(function*() {
      const { message, spans } = yield* runFailing({ body: "" }, "http://agent:hunter2@ch.example.com:8123/analytics")
      assert.include(message, "not a ClickHouse URL")
      assert.notInclude(message, "hunter2")
      assert.notInclude(spans, "hunter2")
    }))
})
