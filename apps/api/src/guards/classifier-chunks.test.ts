import { assert, describe, it } from "@effect/vitest"
import { type Guard, GuardId, UpstreamFailure } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { WorkersAi } from "../platform/ai"
import { now, orgId, userId } from "../testing/fixtures"
import { Classifier } from "./classifier"
import { decide } from "./evaluation"

const QuestionInput = (input: Readonly<Record<string, unknown>>): ReadonlyArray<string> => {
  const questions = input["questions"]
  return typeof questions === "object" && questions !== null ? Object.keys(questions) : []
}

/** A fake Workers AI that answers 0.1 to every question; `respond` can drop answers or fail per call. */
const clefWith = (respond: (ids: ReadonlyArray<string>, call: number) => Effect.Effect<ReadonlyArray<string>, UpstreamFailure>) => {
  const calls: Array<ReadonlyArray<string>> = []
  const state = { inFlight: 0, maxInFlight: 0 }
  const ai = Layer.succeed(WorkersAi, {
    run: (_model, input) => Effect.gen(function*() {
      const ids = QuestionInput(input)
      const call = calls.push(ids) - 1
      state.inFlight++
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      yield* Effect.yieldNow
      state.inFlight--
      const answered = yield* respond(ids, call)
      return { answers: Object.fromEntries(answered.map((id) => [id, { noul: 0.1 }])) }
    })
  })
  return { calls, state, layer: Layer.effect(Classifier, Classifier.make("@cf/clef")).pipe(Layer.provide(ai)) }
}

const ids = (count: number) => Array.from({ length: count }, (_, index) => `grd_${String(index).padStart(8, "0")}`)
const questionsFor = (count: number) => new Map(ids(count).map((id) => [id, `question ${id}`]))
const classify = (count: number) => Classifier.use((classifier) => classifier.classify({}, questionsFor(count)))

const enforcing = (id: string): Guard => ({
  id: GuardId.make(id), orgId, projectId: null, resourceIds: [], name: id, nameFollowsRule: false, modeFollowsRule: false,
  applies: null, approvers: [], rule: "r", mode: "enforce", threshold: 0.5, status: "active",
  compiled: { instructions: "q", examples: [] }, compiledVersion: 1, testCalls: [], pins: [], verify: null,
  createdBy: userId, createdAt: now, updatedAt: null
})

describe("Clef questions are split into calls of at most 64", () => {
  it.effect("150 guards are asked in three bounded concurrent calls and all answered", () => {
    const { calls, state, layer } = clefWith((asked) => Effect.succeed(asked))
    return Effect.gen(function*() {
      const scores = yield* classify(150)
      assert.deepStrictEqual(calls.map((call) => call.length), [64, 64, 22])
      assert.isTrue(state.maxInFlight > 1 && state.maxInFlight <= 4)
      assert.strictEqual(scores.size, 150)
      assert.strictEqual(decide(ids(150).map(enforcing), scores)._tag, "Allow")
    }).pipe(Effect.provide(layer))
  })

  it.effect("a failing call fails the whole classification, so every enforcing guard denies", () => {
    const { layer } = clefWith((asked, call) => call === 1 ? Effect.fail(new UpstreamFailure({ upstream: "workers-ai", message: "down" })) : Effect.succeed(asked))
    return Effect.gen(function*() {
      const result = yield* Effect.option(classify(150))
      assert.isTrue(Option.isNone(result))
      const verdict = decide(ids(150).map(enforcing), undefined)
      assert.strictEqual(verdict._tag === "Deny" ? verdict.reasons.length : 0, 150)
    }).pipe(Effect.provide(layer))
  })

  it.effect("questions a call leaves unanswered deny; answers to questions not asked in that call are ignored", () => {
    const { layer } = clefWith((asked, call) => Effect.succeed(call === 2 ? ["grd_00000000"] : asked))
    return Effect.gen(function*() {
      const scores = yield* classify(150)
      assert.strictEqual(scores.size, 128)
      const verdict = decide(ids(150).map(enforcing), scores)
      assert.strictEqual(verdict._tag, "Deny")
      if (verdict._tag !== "Deny") return
      assert.deepStrictEqual(verdict.reasons.map((reason) => ("guardId" in reason ? String(reason.guardId) : undefined)), ids(150).slice(128))
      assert.isTrue(verdict.reasons.every((reason) => reason._tag === "GuardUnavailable"))
    }).pipe(Effect.provide(layer))
  })
})
