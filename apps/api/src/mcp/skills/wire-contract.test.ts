import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { makeZip } from "../../testing/archives"
import { userPrincipal } from "../../testing/fixtures"
import { skillWorld, uploadVersion } from "../../testing/skill-services"
import { serveMcp } from "../sdk"
import { SkillGateway } from "./skill-gateway"
import { withoutBuiltins } from "../../testing/builtin-skills"

const caller = userPrincipal({ permissions: ["resources:read", "resources:manage"] })

const Reply = Schema.Struct({ result: Schema.optional(Schema.Unknown), error: Schema.optional(Schema.Unknown) })
const decodeReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))
const decodeListed = Schema.decodeUnknownSync(Schema.Struct({ resources: Schema.Array(Schema.Unknown) }))

/** One JSON-RPC call through the real SDK server, so the wire shapes are what the CLI will see. */
const rpc = (method: string, params: Record<string, unknown>) =>
  Effect.gen(function*() {
    const skills = yield* SkillGateway
    const run = Effect.runPromiseWith(yield* Effect.context<never>())
    const request = new Request("https://api.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    })
    const text = yield* Effect.promise(() =>
      serveMcp(request, {
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        listPrompts: () => run(skills.listPrompts(caller)),
        getPrompt: (name, args) => run(Effect.result(skills.getPrompt(caller, name, args))),
        listResources: () => run(skills.listResources(caller)),
        readResource: (uri) => run(Effect.result(skills.readResource(caller, uri)))
      }).then((reply) => reply.text())
    )
    return decodeReply(text.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? text)
  })

describe("the skill resources contract on the MCP wire", () => {
  const world = skillWorld({ scanning: "off" })

  it.effect("lists and reads every file with its _meta, text as text and binaries as base64 blobs", () =>
    Effect.gen(function*() {
      const zip = yield* Effect.promise(() =>
        makeZip([
          { name: "SKILL.md", content: "---\nname: pdf-tools\ndescription: Fill PDFs\n---\nUse scripts/fill.sh\n" },
          { name: "scripts/fill.sh", content: "echo hi\n", unixMode: 0o100755 },
          { name: "assets/icon.png", content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0]) }
        ])
      )
      const version = yield* uploadVersion(caller, zip)
      const meta = (path: string, mode: string) => ({
        "smartplane.dev/skill": "pdf-tools",
        "smartplane.dev/path": path,
        "smartplane.dev/mode": mode,
        "smartplane.dev/version": version.contentHash
      })
      const listed = yield* rpc("resources/list", {})
      assert.deepStrictEqual({ resources: withoutBuiltins(decodeListed(listed.result).resources) }, {
        resources: [
          { uri: "skill://pdf-tools", name: "pdf-tools", title: "PDF tools", description: "Fill PDFs", mimeType: "text/markdown", size: 67, _meta: meta("SKILL.md", "644") },
          {
            uri: "skill://pdf-tools/assets/icon.png",
            name: "pdf-tools/assets/icon.png",
            title: "PDF tools: assets/icon.png",
            description: "File of the pdf-tools skill.",
            mimeType: "image/png",
            size: 5,
            _meta: meta("assets/icon.png", "644")
          },
          {
            uri: "skill://pdf-tools/scripts/fill.sh",
            name: "pdf-tools/scripts/fill.sh",
            title: "PDF tools: scripts/fill.sh",
            description: "File of the pdf-tools skill.",
            mimeType: "application/x-sh",
            size: 8,
            _meta: meta("scripts/fill.sh", "755")
          }
        ]
      })
      assert.deepStrictEqual((yield* rpc("resources/read", { uri: "skill://pdf-tools/assets/icon.png" })).result, {
        contents: [{ uri: "skill://pdf-tools/assets/icon.png", mimeType: "image/png", blob: "iVBORwA=", _meta: meta("assets/icon.png", "644") }]
      })
      assert.deepStrictEqual((yield* rpc("resources/read", { uri: "skill://pdf-tools/scripts/fill.sh" })).result, {
        contents: [{ uri: "skill://pdf-tools/scripts/fill.sh", mimeType: "application/x-sh", text: "echo hi\n", _meta: meta("scripts/fill.sh", "755") }]
      })
    }).pipe(Effect.provide(world.layer)))
})
