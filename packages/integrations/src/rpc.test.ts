import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { RunRequestJson, RunResponseJson, UnsupportedAction } from "./rpc"

describe("runner RPC contract", () => {
  it.effect("carries credentials as plain strings on the wire and Redacted in memory", () =>
    Effect.gen(function*() {
      const wire = {
        orgId: "org_testorg01",
        resourceId: "res_integration1",
        pieceId: "github",
        actionName: "get_issue_ai",
        auth: { type: "secret_text", secret: "ghp_secret" },
        props: { owner: "acme" }
      }
      const decoded = yield* Schema.decodeUnknownEffect(RunRequestJson)(wire)
      assert.strictEqual(decoded.auth.type === "secret_text" ? Redacted.value(decoded.auth.secret) : "", "ghp_secret")
      assert.notInclude(String(decoded.auth.type === "secret_text" ? decoded.auth.secret : ""), "ghp_secret")
      assert.deepStrictEqual(yield* Schema.encodeEffect(RunRequestJson)(decoded), wire)
    }))

  it.effect("round-trips typed failures", () =>
    Effect.gen(function*() {
      const error = new UnsupportedAction({ pieceId: "slack", actionName: "request_approval_message", reason: "pauses a flow" })
      const wire = yield* Schema.encodeEffect(RunResponseJson)({ ok: false, error })
      const decoded = yield* Schema.decodeUnknownEffect(RunResponseJson)(JSON.parse(JSON.stringify(wire)))
      assert.isFalse(decoded.ok)
      if (!decoded.ok) {
        assert.instanceOf(decoded.error, UnsupportedAction)
        assert.include(decoded.error.message, "pauses a flow")
      }
    }))
})
