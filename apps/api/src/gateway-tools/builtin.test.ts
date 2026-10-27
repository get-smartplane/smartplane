import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { actorOf } from "../audit/actor"
import { userPrincipal } from "../testing/fixtures"
import { accessOf, grantOf, resourceOf } from "../testing/gateway-fakes"
import { skillContent } from "../testing/skill-content"
import { makeBuiltinProvider } from "./builtin"
import { withoutBuiltins } from "../testing/builtin-skills"

const notes = resourceOf("res_skillnotes1", "Release notes", {
  kind: "skill",
  description: "Write release notes",
  body: "Notes for {{version}}.",
  arguments: [{ name: "version", required: true }]
})
const principal = userPrincipal()
const scope = { principal, actor: actorOf(principal), access: accessOf(grantOf(notes, "read")) }

const call = (name: string, args: Readonly<Record<string, unknown>>) =>
  Effect.gen(function*() {
    const tool = (yield* (yield* makeBuiltinProvider).tools(scope)).find((candidate) => candidate.definition.name === name)
    if (tool === undefined) return assert.fail(`no built-in ${name}`)
    const prepared = yield* tool.prepare(args)
    return (yield* prepared.execute).content[0]?.text
  })

describe("skill built-ins, for clients without prompt support", () => {
  it.effect("lists skills with their prompt slug and arguments", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(withoutBuiltins(JSON.parse(String(yield* call("skills_list", {})))), [
        { name: "Release notes", slug: "release-notes", description: "Write release notes", arguments: [{ name: "version", required: true }] }
      ])
    }).pipe(Effect.provide(skillContent())))

  it.effect("returns the raw template without arguments, and renders it with them, by name or slug", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* call("skills_get", { name: "Release notes" }), "Notes for {{version}}.")
      assert.strictEqual(yield* call("skills_get", { name: "release-notes", arguments: { version: "v2" } }), "Notes for v2.")
      const refused = yield* Effect.flip(call("skills_get", { name: "release-notes", arguments: {} }))
      assert.strictEqual(refused._tag, "InvalidInput")
    }).pipe(Effect.provide(skillContent())))
})
