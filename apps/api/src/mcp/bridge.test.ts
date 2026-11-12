import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Layer, Logger, Schema } from "effect"
import { userPrincipal } from "../testing/fixtures"
import { gatewayHandlers, InternalErrorText } from "./bridge"
import { McpGateway } from "./gateway"
import { serveMcp, textResult } from "./sdk"
import { SkillGateway } from "./skills/skill-gateway"

const leak = "D1_ERROR: no such column: secret_values.ciphertext"
const defect = () => Effect.die(new Error(leak))

const Reply = Schema.Struct({
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Struct({ code: Schema.Number, message: Schema.String }))
})
const decodeReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))

const failing = Layer.mergeAll(
  Layer.succeed(McpGateway, { listTools: defect, callTool: defect }),
  Layer.succeed(SkillGateway, { listPrompts: defect, getPrompt: defect, listResources: defect, readResource: defect })
)

/** One JSON-RPC request through the real SDK server, with the handlers `route.ts` uses. */
const rpc = (method: string, params: Record<string, unknown>) =>
  Effect.gen(function*() {
    const handlers = yield* gatewayHandlers(userPrincipal(), undefined)
    const request = new Request("https://api.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    })
    const text = yield* Effect.promise(() => serveMcp(request, handlers).then((reply) => reply.text()))
    return { text, reply: decodeReply(text.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? text) }
  })

describe("MCP handler failures", () => {
  it.effect("never send a defect's message to the agent, and log it with its cause", () => {
    const logged: Array<string> = []
    const logger = Logger.make(({ message, cause }) => void logged.push(`${JSON.stringify(message)} ${Cause.pretty(cause)}`))
    return Effect.gen(function*() {
      const call = yield* rpc("tools/call", { name: "reports__delete", arguments: {} })
      assert.deepStrictEqual(call.reply.result, { content: [{ type: "text", text: InternalErrorText }], isError: true })
      for (const method of ["tools/list", "prompts/list", "resources/list"]) {
        const { text, reply } = yield* rpc(method, {})
        assert.notInclude(text, "D1_ERROR")
        assert.strictEqual(reply.error?.message, InternalErrorText)
      }
      assert.notInclude(call.text, "D1_ERROR")
      assert.strictEqual(logged.length, 4)
      assert.isTrue(logged.every((line) => line.includes("MCP handler failed") && line.includes(leak)))
    }).pipe(Effect.provide(Layer.merge(failing, Logger.layer([logger]))))
  })

  it.effect("run handlers under the request's span", () => {
    const traced = Layer.mergeAll(
      Layer.succeed(McpGateway, {
        listTools: defect,
        callTool: () => Effect.map(Effect.orDie(Effect.currentSpan), (span) => textResult(span.name))
      }),
      Layer.succeed(SkillGateway, { listPrompts: defect, getPrompt: defect, listResources: defect, readResource: defect })
    )
    return Effect.gen(function*() {
      const call = yield* rpc("tools/call", { name: "x", arguments: {} }).pipe(Effect.withSpan("mcp.request"))
      assert.deepStrictEqual(call.reply.result, { content: [{ type: "text", text: "mcp.request" }], isError: false })
    }).pipe(Effect.provide(traced))
  })
})
