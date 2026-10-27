import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import type { Recorded } from "../testing/gateway-fakes"
import { skillCaller, skillGatewayWith } from "../testing/skill-fakes"
import { serveMcp } from "./sdk"
import { SkillGateway } from "./skills/skill-gateway"

const Reply = Schema.Struct({
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Struct({ code: Schema.Number, message: Schema.String }))
})
const decodeReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))

/** One JSON-RPC request through the real SDK server, bridged to the gateway the way `route.ts` does it. */
const rpc = (method: string, params: Record<string, unknown>) =>
  Effect.gen(function*() {
    const skills = yield* SkillGateway
    const run = Effect.runPromiseWith(yield* Effect.context<never>())
    const request = new Request("https://api.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    })
    const response = yield* Effect.promise(() =>
      serveMcp(request, {
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        listPrompts: () => run(skills.listPrompts(skillCaller)),
        getPrompt: (name, args) => run(Effect.result(skills.getPrompt(skillCaller, name, args))),
        listResources: () => run(skills.listResources(skillCaller)),
        readResource: (uri) => run(Effect.result(skills.readResource(skillCaller, uri)))
      }).then((reply) => reply.text())
    )
    // Stateless replies arrive as a single SSE `message` event.
    return decodeReply(response.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? response)
  })

describe("skills over the MCP wire", () => {
  const events: Array<Recorded> = []
  const layer = skillGatewayWith(events)

  it.effect("serves prompts/list and prompts/get as spec prompt messages", () =>
    Effect.gen(function*() {
      const listed = yield* rpc("prompts/list", {})
      assert.include(JSON.stringify(listed.result), `"name":"release-notes","title":"Release notes"`)
      const got = yield* rpc("prompts/get", { name: "release-notes", arguments: { version: "v3" } })
      assert.deepStrictEqual(got.result, {
        description: "Release notes description",
        messages: [{ role: "user", content: { type: "text", text: "Notes for v3." } }]
      })
    }).pipe(Effect.provide(layer)))

  it.effect("answers a missing argument or unknown prompt with invalid params (-32602)", () =>
    Effect.gen(function*() {
      const missing = yield* rpc("prompts/get", { name: "release-notes", arguments: {} })
      assert.deepStrictEqual([missing.error?.code, missing.error?.message.includes(`"version"`)], [-32602, true])
      assert.strictEqual((yield* rpc("prompts/get", { name: "nope" })).error?.code, -32602)
    }).pipe(Effect.provide(layer)))

  it.effect("serves resources/list and resources/read, refusing unknown URIs", () =>
    Effect.gen(function*() {
      assert.include(JSON.stringify((yield* rpc("resources/list", {})).result), `"uri":"skill://release-notes"`)
      const read = yield* rpc("resources/read", { uri: "skill://release-notes" })
      assert.deepInclude(JSON.parse(JSON.stringify(read.result)).contents[0], { uri: "skill://release-notes", mimeType: "text/markdown", text: "Notes for {{version}}{{tone}}." })
      assert.strictEqual((yield* rpc("resources/read", { uri: "skill://nope" })).error?.code, -32602)
    }).pipe(Effect.provide(layer)))
})
