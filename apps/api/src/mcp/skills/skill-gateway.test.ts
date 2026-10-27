import { assert, describe, it } from "@effect/vitest"
import { DenyReason } from "@pc/domain"
import { Effect, Schema } from "effect"
import type { Recorded } from "../../testing/gateway-fakes"
import { inProject, releaseNotes, skillCaller, skillGatewayWith } from "../../testing/skill-fakes"
import { SkillGateway } from "./skill-gateway"
import { withoutBuiltins } from "../../testing/builtin-skills"

const setup = () => {
  const events: Array<Recorded> = []
  return { events, layer: skillGatewayWith(events) }
}

describe("skills as MCP prompts and resources", () => {
  it.effect("lists only skills granted read, in the caller's project scope and unexpired", () =>
    Effect.gen(function*() {
      const gateway = yield* SkillGateway
      const prompts = withoutBuiltins(yield* gateway.listPrompts(skillCaller))
      assert.deepStrictEqual(prompts.map((prompt) => [prompt.name, prompt.title]), [
        ["project-a-playbook", "Project A playbook"],
        ["release-notes", "Release notes"]
      ])
      assert.deepStrictEqual(prompts[1]?.arguments, [{ name: "version", required: true }, { name: "tone", description: "Voice" }])
      const resources = withoutBuiltins(yield* gateway.listResources(skillCaller))
      assert.deepStrictEqual(resources.map((resource) => [resource.uri, resource.mimeType]), [
        ["skill://project-a-playbook", "text/markdown"],
        ["skill://release-notes", "text/markdown"]
      ])
    }).pipe(Effect.provide(setup().layer)))

  it.effect("renders a prompt's arguments and audits the read against the skill", () => {
    const { events, layer } = setup()
    return Effect.gen(function*() {
      const prompt = yield* SkillGateway.use((gateway) => gateway.getPrompt(skillCaller, "release-notes", { version: "v2", tone: " (plain)" }))
      assert.deepStrictEqual(prompt, { description: "Release notes description", text: "Notes for v2 (plain)." })
      assert.deepStrictEqual(events, [{
        type: "mcp.prompt_read",
        target: { type: "resource", id: releaseNotes.id },
        data: { prompt: "release-notes", arguments: { version: "v2", tone: " (plain)" }, version: events[0]?.data.version, isError: false }
      }])
    }).pipe(Effect.provide(layer))
  })

  it.effect("refuses a missing required argument as invalid input, and audits the rejection", () => {
    const { events, layer } = setup()
    return Effect.gen(function*() {
      const error = yield* Effect.flip(SkillGateway.use((gateway) => gateway.getPrompt(skillCaller, "release-notes", {})))
      assert.deepStrictEqual([error._tag, error._tag === "InvalidInput" && error.message], ["InvalidInput", `Missing required argument "version".`])
      assert.deepStrictEqual(events.map((event) => [event.type, event.data.isError, event.data.rejected]), [
        ["mcp.prompt_read", true, `Missing required argument "version".`]
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect("treats ungranted, out-of-scope and expired skills as unknown, recording a denial", () => {
    const { events, layer } = setup()
    return Effect.gen(function*() {
      const gateway = yield* SkillGateway
      for (const name of ["ungranted-skill", "project-b-playbook", "expired-skill"]) {
        assert.strictEqual((yield* Effect.flip(gateway.getPrompt(skillCaller, name, {})))._tag, "NotFound")
      }
      assert.strictEqual((yield* Effect.flip(gateway.readResource(skillCaller, "skill://ungranted-skill")))._tag, "NotFound")
      assert.deepStrictEqual(events.map((event) => `${event.type}:${event.target}`), Array.from({ length: 4 }, () => "policy.denied:null"))
      const reasons = Schema.decodeUnknownSync(Schema.Array(DenyReason))(events[3]?.data.reasons)
      assert.deepStrictEqual(reasons, [{ _tag: "UnknownSkill", name: "skill://ungranted-skill" }])
    }).pipe(Effect.provide(layer))
  })

  it.effect("reads a skill resource as its raw markdown template, and audits it", () => {
    const { events, layer } = setup()
    return Effect.gen(function*() {
      const read = yield* SkillGateway.use((gateway) => gateway.readResource(skillCaller, "skill://project-a-playbook"))
      const version = read._meta["smartplane.dev/version"] ?? ""
      assert.deepStrictEqual(read, {
        uri: "skill://project-a-playbook",
        mimeType: "text/markdown",
        text: "Notes for {{version}}{{tone}}.",
        _meta: { "smartplane.dev/skill": "project-a-playbook", "smartplane.dev/path": "SKILL.md", "smartplane.dev/mode": "644", "smartplane.dev/version": version }
      })
      assert.match(String(version), /^[0-9a-f]{64}$/)
      assert.deepStrictEqual(events, [{
        type: "mcp.resource_read",
        target: { type: "resource", id: inProject.id },
        data: { uri: "skill://project-a-playbook", path: "SKILL.md", version }
      }])
    }).pipe(Effect.provide(layer))
  })
})
