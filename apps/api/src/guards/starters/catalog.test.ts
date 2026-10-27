import { assert, describe, it } from "@effect/vitest"
import { CompiledGuard, GuardStarterId } from "@pc/domain"
import { Schema } from "effect"
import { readFileSync } from "node:fs"
import { readIntent } from "../compile/intent"
import { questionFor } from "../evaluation"
import { starterFor, starters } from "./catalog"
import recorded from "./recorded/clef-flash.json"
import { compiledOf } from "./starter"

/** Well below the 0.7 onboarding uses: a benign call must not come near triggering. */
const benignCeiling = 0.3

describe("starter catalog", () => {
  it("has exactly one entry per starter id", () => {
    assert.deepStrictEqual(starters.map((starter) => starter.id).sort(), [...GuardStarterId.literals].sort())
    for (const id of GuardStarterId.literals) assert.isDefined(starterFor(id), id)
  })

  it("compiles to a valid check whose suggested mode matches the rule's wording", () => {
    for (const starter of starters) {
      const compiled = compiledOf(starter)
      Schema.decodeUnknownSync(CompiledGuard)(compiled)
      assert.strictEqual(compiled.suggestion?.mode, readIntent(starter.rule).mode, starter.id)
      assert.isAtLeast(starter.examples.filter((example) => example.violates).length, 2, starter.id)
      assert.isAtLeast(starter.examples.filter((example) => !example.violates).length, 2, starter.id)
      assert.isAtLeast(starter.benign.length, 2, starter.id)
    }
  })

  it("never ties a prepared question to one tool's name", () => {
    for (const starter of starters) assert.match(starter.instructions, /whatever (?:it|the tool) is called|any tool/i, starter.id)
  })
})

describe("starter questions on Clef (recorded by scripts/eval-starters.ts)", () => {
  const cases = new Map(recorded.cases.map((entry) => [entry.id, entry]))
  for (const starter of starters) {
    it(starter.id, () => {
      const result = cases.get(starter.id)
      assert.isDefined(result, "not recorded: run scripts/eval-starters.ts --write")
      // A changed question must be measured again before it ships.
      assert.strictEqual(result?.question, questionFor(compiledOf(starter)), "the question changed since it was recorded")
      const [sample, ...benign] = result?.calls ?? []
      assert.deepStrictEqual([sample?.tool, sample?.arguments, sample?.violates], [starter.sample.tool, starter.sample.arguments, true])
      assert.isAtLeast(sample?.probability.test ?? 0, recorded.threshold)
      assert.isAtLeast(sample?.probability.gateway ?? 0, recorded.threshold)
      assert.deepStrictEqual(benign.map((call) => call.tool), starter.benign.map((call) => call.tool))
      for (const call of benign) {
        assert.isFalse(call.violates)
        assert.isBelow(call.probability.test, benignCeiling, `${call.tool} ${JSON.stringify(call.arguments)}`)
        assert.isBelow(call.probability.gateway, benignCeiling, `${call.tool} ${JSON.stringify(call.arguments)}`)
      }
    })
  }
})

describe("onboarding's suggestions", () => {
  // The dashboard lists the suggestions; each must be the prepared rule it creates, word for word, with the same sample call.
  const source = readFileSync(new URL("../../../../web/src/features/onboarding/rule/suggestions.ts", import.meta.url), "utf8")
  const listed = [...source.matchAll(/starterId: "([^"]+)",\s*label: "[^"]*",\s*rule: "((?:[^"\\]|\\.)*)",\s*sample: \{ tool: "([^"]+)", arguments: (\{.*?\}) \}/g)]
  const json = (objectLiteral: string): unknown => JSON.parse(objectLiteral.replace(/([{,]\s*)([A-Za-z_]\w*):/g, "$1\"$2\":"))

  it("covers every starter", () => {
    assert.deepStrictEqual([...new Set(listed.map((match) => match[1]))].sort(), [...GuardStarterId.literals].sort())
  })

  it("match the catalog's wording and sample", () => {
    for (const [, id, rule, tool, args] of listed) {
      const starter = starterFor(Schema.decodeUnknownSync(GuardStarterId)(id))
      assert.strictEqual(rule, starter?.rule, id)
      assert.strictEqual(tool, starter?.sample.tool, id)
      assert.deepStrictEqual(json(args ?? "{}"), starter?.sample.arguments, id)
    }
  })
})
