import { assert, describe, it } from "@effect/vitest"
import { type GuardTestedCall, selfTestSummary, UpstreamFailure } from "@pc/domain"
import { Effect } from "effect"
import { resourceOf } from "../../testing/gateway-fakes"
import type { Classifier } from "../classifier"
import type { CompiledDraft } from "../compiler"
import { draftTestAndRetry, runSelfTest } from "./run"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const draft = (instructions: string): CompiledDraft => ({ compiled: { instructions, examples: [] }, calls: [] })
const tested = (violates: boolean, triggered: boolean, note = ""): GuardTestedCall => ({
  tool: "notion__notion-update-page",
  resourceId: notion.id,
  arguments: { page_id: note },
  violates,
  note,
  source: "generated",
  probability: triggered ? 0.9 : 0.1,
  triggered
})

describe("selfTestSummary", () => {
  it("counts caught violations and allowed near misses", () => {
    const calls = [tested(true, true), tested(true, true), tested(true, false), tested(false, false), tested(false, true)]
    assert.strictEqual(selfTestSummary({ calls }), "Caught 2 of 3 calls that break it · allowed 1 of 2 that don't")
  })
})

describe("draftTestAndRetry", () => {
  it.effect("does not recompile a draft that judges every call right", () => {
    const drafts: Array<string | undefined> = []
    return Effect.gen(function*() {
      const result = yield* draftTestAndRetry(
        (feedback) => Effect.sync(() => (drafts.push(feedback), draft("Q1"))),
        () => Effect.succeed([tested(true, true), tested(false, false)])
      )
      assert.deepStrictEqual(drafts, [undefined])
      assert.isFalse(result.retried)
    })
  })

  it.effect("recompiles once with the mistakes fed back, and keeps the better draft", () => {
    const feedback: Array<string | undefined> = []
    return Effect.gen(function*() {
      const result = yield* draftTestAndRetry(
        (text) => Effect.sync(() => (feedback.push(text), draft(feedback.length === 1 ? "Q1" : "Q2"))),
        (d) => Effect.succeed(d.compiled.instructions === "Q1" ? [tested(true, false, "tick a to-do"), tested(false, false)] : [tested(true, true), tested(false, false)])
      )
      assert.strictEqual(feedback.length, 2)
      assert.include(feedback[1], "tick a to-do")
      assert.include(feedback[1], "breaks the rule but was allowed")
      assert.strictEqual(result.draft.compiled.instructions, "Q2")
      assert.isTrue(result.retried)
    })
  })

  it.effect("keeps the first draft when the retry is no better, and never tries a third time", () => {
    let drafts = 0
    return Effect.gen(function*() {
      const result = yield* draftTestAndRetry(
        () => Effect.sync(() => draft(`Q${++drafts}`)),
        () => Effect.succeed([tested(true, false), tested(false, false)])
      )
      assert.strictEqual(drafts, 2)
      assert.strictEqual(result.draft.compiled.instructions, "Q1")
    })
  })
})

describe("runSelfTest", () => {
  it.effect("asks the classifier about each call with the gateway's state and the guard's threshold", () => {
    const states: Array<unknown> = []
    const classifier: Classifier["Service"] = {
      classify: (state) => Effect.sync(() => (states.push(state), new Map([["guard", states.length === 1 ? 0.8 : 0.2]])))
    }
    const doc = { resourceId: notion.id, product: "Notion", origin: "mcp:x", gatewayName: "notion__notion-update-page", name: "notion-update-page", title: "Update page", description: "Update a Notion page", inputSchema: {}, access: "destructive" as const }
    const calls = [true, false].map((violates) => ({ call: { tool: doc.gatewayName, resourceId: notion.id, arguments: { page_id: String(violates) }, violates }, source: "generated" as const }))
    return Effect.gen(function*() {
      const results = yield* runSelfTest(classifier, "Q", calls, { resources: new Map([[notion.id, notion]]), tools: new Map([[doc.gatewayName, doc]]), threshold: 0.5 })
      assert.deepStrictEqual(results.map((r) => [r.violates, r.triggered]), [[true, true], [false, false]])
      assert.deepInclude(states[0], { tool: "notion-update-page", toolTitle: "Update page", toolDescription: "[Notion] Update a Notion page" })
    })
  })

  it.effect("fails when the classifier is unavailable, so verify keeps the draft untested", () => {
    const classifier: Classifier["Service"] = { classify: () => Effect.fail(new UpstreamFailure({ upstream: "clef", message: "down" })) }
    const call = { call: { tool: "notion__notion-update-page", resourceId: notion.id, arguments: {}, violates: true }, source: "generated" as const }
    return Effect.gen(function*() {
      const error = yield* Effect.flip(runSelfTest(classifier, "Q", [call], { resources: new Map([[notion.id, notion]]), tools: new Map(), threshold: 0.5 }))
      assert.strictEqual(error._tag, "UpstreamFailure")
    })
  })
})
