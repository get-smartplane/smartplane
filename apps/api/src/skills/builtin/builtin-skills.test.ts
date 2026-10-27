import { readdirSync, readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { type Principal, ResourceId } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { AccessPolicy } from "../../access/access-policy"
import { actorOf } from "../../audit/actor"
import { makeBuiltinProvider } from "../../gateway-tools/builtin"
import { gatewayInstructions, serveMcp } from "../../mcp/sdk"
import { SkillGateway } from "../../mcp/skills/skill-gateway"
import { Resources } from "../../resources/resources"
import { userPrincipal } from "../../testing/fixtures"
import { resourceServices } from "../../testing/resource-world"
import { type Recorded, recordingAudit } from "../../testing/gateway-fakes"
import { skillContent } from "../../testing/skill-content"
import { builtinSkills, refuseBuiltin } from "./builtin-skills"
import smartplaneDeployMd from "./smartplane/references/deploy.md"
import smartplaneSkillMd from "./smartplane/SKILL.md"

/** A member of an org that has granted them nothing at all. */
const nobody = userPrincipal({ permissions: [] })
const noGrants = Layer.succeed(AccessPolicy, { resolve: (_: Principal) => Effect.succeed(new Map()) })
const world = (events: Array<Recorded>) => SkillGateway.layer.pipe(Layer.provide([noGrants, recordingAudit(events), skillContent()]))

const Reply = Schema.Struct({ result: Schema.optional(Schema.Unknown) })
const InitializeResult = Schema.Struct({ instructions: Schema.String })

const initialize = Effect.promise(async () => {
  const request = new Request("https://api.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }
    })
  })
  const empty = async () => []
  const text = await (await serveMcp(request, {
    listTools: empty,
    callTool: async () => ({ content: [] }),
    listPrompts: empty,
    getPrompt: async () => Promise.reject(new Error("unused")),
    listResources: empty,
    readResource: async () => Promise.reject(new Error("unused"))
  })).text()
  const reply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(text.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? text)
  return Schema.decodeUnknownSync(InitializeResult)(reply.result)
})

describe("the built-in smartplane skill", () => {
  it.effect("is served to a member with no grants as a prompt and a skill:// resource with _meta", () => {
    const events: Array<Recorded> = []
    return Effect.gen(function*() {
      const gateway = yield* SkillGateway
      assert.deepStrictEqual((yield* gateway.listPrompts(nobody)).map((prompt) => prompt.name), ["smartplane"])
      const [listed, deploy, ...rest] = yield* gateway.listResources(nobody)
      assert.deepStrictEqual(rest, [])
      assert.strictEqual(listed?.uri, "skill://smartplane")
      assert.strictEqual(deploy?.uri, "skill://smartplane/references/deploy.md")
      assert.strictEqual(deploy?.mimeType, "text/markdown")
      assert.strictEqual(deploy?._meta["smartplane.dev/path"], "references/deploy.md")
      assert.strictEqual(deploy?._meta["smartplane.dev/builtin"], "true")
      const version = listed?._meta["smartplane.dev/version"] ?? ""
      assert.match(version, /^[0-9a-f]{64}$/)
      assert.deepStrictEqual(listed?._meta, {
        "smartplane.dev/skill": "smartplane",
        "smartplane.dev/path": "SKILL.md",
        "smartplane.dev/mode": "644",
        "smartplane.dev/version": version,
        "smartplane.dev/builtin": "true"
      })
      assert.strictEqual(deploy?._meta["smartplane.dev/version"], version, "one version covers every file")
      assert.deepStrictEqual(events, [], "listing is not audited")

      const read = yield* gateway.readResource(nobody, "skill://smartplane")
      assert.strictEqual("text" in read ? read.text : "", smartplaneSkillMd)
      const reference = yield* gateway.readResource(nobody, "skill://smartplane/references/deploy.md")
      assert.strictEqual("text" in reference ? reference.text : "", smartplaneDeployMd)
      const prompt = yield* gateway.getPrompt(nobody, "smartplane", {})
      assert.include(prompt.text, "smartplane run --")
      assert.notInclude(prompt.text, "name: smartplane", "the prompt is the body, without frontmatter")
      assert.deepStrictEqual(events.map((event) => [event.type, event.target, event.data.builtin, event.data.version]), [
        ["mcp.resource_read", null, "smartplane", version],
        ["mcp.resource_read", null, "smartplane", version],
        ["mcp.prompt_read", null, "smartplane", version]
      ])
    }).pipe(Effect.provide(world(events)))
  })

  it.effect("has a stable version: the same content hash on every request", () =>
    Effect.gen(function*() {
      const gateway = yield* SkillGateway
      const first = (yield* gateway.listResources(nobody))[0]?._meta["smartplane.dev/version"]
      const second = (yield* gateway.listResources(userPrincipal()))[0]?._meta["smartplane.dev/version"]
      assert.isDefined(first)
      assert.strictEqual(first, second)
    }).pipe(Effect.provide(world([]))))

  it.effect("is listed and returned by skills_list / skills_get without a grant", () =>
    Effect.gen(function*() {
      const scope = { principal: nobody, actor: actorOf(nobody), access: new Map() }
      const tools = yield* (yield* makeBuiltinProvider).tools(scope)
      const run = (name: string, args: Readonly<Record<string, unknown>>) =>
        Effect.gen(function*() {
          const tool = tools.find((candidate) => candidate.definition.name === name)
          if (tool === undefined) return assert.fail(`no ${name}`)
          return String((yield* (yield* tool.prepare(args)).execute).content[0]?.text)
        })
      const listed = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.Struct({ slug: Schema.String, builtin: Schema.optional(Schema.Boolean) }))))(
        yield* run("skills_list", {})
      )
      assert.deepStrictEqual(listed, [{ slug: "smartplane", builtin: true }])
      const got = yield* run("skills_get", { name: "smartplane" })
      assert.isTrue(got.startsWith(smartplaneSkillMd))
      assert.include(got, `- skill://smartplane/references/deploy.md (${new TextEncoder().encode(smartplaneDeployMd).length} bytes)`)
    }).pipe(Effect.provide(skillContent())))

  it.effect("cannot be edited or deleted, even by resources:manage", () =>
    Effect.gen(function*() {
      const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
      const resources = yield* Resources
      for (const skill of builtinSkills) {
        assert.strictEqual((yield* Effect.flip(resources.remove(admin, skill.id)))._tag, "Forbidden")
        assert.strictEqual((yield* Effect.flip(resources.update(admin, skill.id, { description: "mine now" })))._tag, "Forbidden")
      }
      assert.strictEqual((yield* Effect.exit(refuseBuiltin(ResourceId.make("res_someother1"))))._tag, "Success")
    }).pipe(Effect.provide(resourceServices())))

  it("ships an identical public copy at skills/smartplane for `npx skills add`, file for file", () => {
    const builtinDir = new URL("./smartplane/", import.meta.url)
    const publicDir = new URL("../../../../../skills/smartplane/", import.meta.url)
    /** Every file below `dir`, as relative paths; a name that cannot be listed as a folder is a file. */
    const filesOf = (dir: URL, prefix = ""): Array<string> =>
      readdirSync(new URL(prefix, dir)).flatMap((name) => {
        try {
          return filesOf(dir, `${prefix}${name}/`)
        } catch {
          return [`${prefix}${name}`]
        }
      }).sort()
    const served = builtinSkills.find((skill) => skill.slug === "smartplane")?.files.map((file) => file.path).sort()
    assert.deepStrictEqual(filesOf(builtinDir), ["SKILL.md", "references/deploy.md"])
    assert.deepStrictEqual(filesOf(publicDir), filesOf(builtinDir))
    assert.deepStrictEqual(served, filesOf(builtinDir), "every file in the folder is served")
    for (const path of filesOf(builtinDir)) assert.strictEqual(readFileSync(new URL(path, publicDir), "utf8"), readFileSync(new URL(path, builtinDir), "utf8"), path)
    assert.strictEqual(readFileSync(new URL("SKILL.md", publicDir), "utf8"), smartplaneSkillMd)
  })

  it.effect("is summarised in the MCP server instructions", () =>
    Effect.gen(function*() {
      const { instructions } = yield* initialize
      assert.strictEqual(instructions, gatewayInstructions)
      const lines = instructions.split("\n")
      assert.isAtLeast(lines.length, 5)
      assert.isAtMost(lines.length, 8)
      for (const phrase of ["<server>__<tool>", "smartplane run --", "[smartplane:NAME]", "approver", "guard rule"]) assert.include(instructions, phrase)
    }))
})
