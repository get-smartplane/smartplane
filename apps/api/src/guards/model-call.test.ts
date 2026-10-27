import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { WorkersAi } from "../platform/ai"
import { evalDirectory, evalOrgContext } from "./compile/eval-set"
import { GuardCompiler } from "./compiler"
import { compileCall, reasoningParams, runModel } from "./model-call"

const linear = {
  intent: { mode: "require_approval", approvers: [{ kind: "author" }] },
  tools: [],
  instructions: "Does this action create a new issue in Linear? Updates, comments and reads do not count.",
  examples: [
    { action: "linear.create_issue {title: \"Checkout bug\"}", violates: true },
    { action: "linear.create_issue {title: \"Flaky test\", team: \"ENG\"}", violates: true },
    { action: "linear.update_issue {id: \"ENG-1\", state: \"Done\"}", violates: false },
    { action: "linear.list_issues {team: \"ENG\"}", violates: false }
  ]
}
/** A first draft the review rejects (it asks about approval), so a correction is wanted. */
const flawed = { ...linear, instructions: "Does this action create a Linear issue without the owner's approval?" }

/** Answers each call after `delays[n]` seconds (`never` hangs); records the inputs. */
const slowAi = (delays: ReadonlyArray<number | "never">, answers: ReadonlyArray<unknown>, inputs: Array<Readonly<Record<string, unknown>>> = []) =>
  Layer.succeed(WorkersAi, {
    run: (_model, input) =>
      Effect.suspend(() => {
        const n = inputs.push(input) - 1
        const delay = delays[n] ?? 0
        return delay === "never" ? Effect.never : Effect.as(Effect.sleep(Duration.seconds(delay)), { response: answers[n] ?? answers.at(-1) })
      })
  })

const compile = GuardCompiler.use((compiler) => compiler.compile("nobody creates issues on linear without my permission", evalOrgContext, evalDirectory))
const compilerWith = (ai: Layer.Layer<WorkersAi>) => Layer.effect(GuardCompiler, GuardCompiler.make("@cf/zai-org/glm-5.3-flash")).pipe(Layer.provide(ai))

describe("model calls", () => {
  it("spells reasoning effort per model family and leaves it out for models that do not reason", () => {
    assert.deepStrictEqual(reasoningParams("@cf/zai-org/glm-5.3-flash", "low"), { reasoning_effort: "low" })
    assert.deepStrictEqual(reasoningParams("@cf/openai/gpt-oss-120b", "low"), { reasoning: { effort: "low" } })
    assert.deepStrictEqual(reasoningParams("@cf/mistralai/mistral-small-3.1-24b-instruct", "low"), {})
  })

  it.effect("fails with a typed ModelTimedOut past the call's deadline", () =>
    Effect.gen(function*() {
      const ai = yield* WorkersAi
      const fiber = yield* Effect.forkChild(Effect.flip(runModel(ai, compileCall("@cf/zai-org/glm-5.3-flash"), {})))
      yield* TestClock.adjust(Duration.seconds(31))
      const error = yield* Fiber.join(fiber)
      assert.deepStrictEqual([error._tag, error._tag === "ModelTimedOut" ? error.purpose : "", error._tag === "ModelTimedOut" ? error.timeoutMs : 0], ["ModelTimedOut", "compile", 30_000])
    }).pipe(Effect.provide(slowAi(["never"], []))))

  it.effect("a first draft past its timeout fails verify with ModelTimedOut, not a hang", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(Effect.flip(compile))
      yield* TestClock.adjust(Duration.seconds(31))
      assert.strictEqual((yield* Fiber.join(fiber))._tag, "ModelTimedOut")
    }).pipe(Effect.provide(compilerWith(slowAi(["never"], [flawed])))))

  it.effect("a correction that runs late keeps the first draft, inside the compile budget", () => {
    const inputs: Array<Readonly<Record<string, unknown>>> = []
    return Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(compile)
      yield* TestClock.adjust(Duration.seconds(45))
      const compiled = yield* Fiber.join(fiber)
      assert.strictEqual(inputs.length, 2)
      assert.strictEqual(compiled.instructions, flawed.instructions)
    }).pipe(Effect.provide(compilerWith(slowAi([9, "never"], [flawed, linear], inputs))))
  })

  it.effect("skips the correction when too little of the budget is left", () => {
    const inputs: Array<Readonly<Record<string, unknown>>> = []
    const patient = Layer.effect(GuardCompiler, GuardCompiler.make({ ...compileCall("@cf/zai-org/glm-5.3-flash"), timeout: Duration.seconds(60) }))
    return Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(compile)
      yield* TestClock.adjust(Duration.seconds(51))
      yield* Fiber.join(fiber)
      assert.strictEqual(inputs.length, 1)
    }).pipe(Effect.provide(patient.pipe(Layer.provide(slowAi([50], [flawed], inputs)))))
  })

  it.effect("sends low reasoning and a bounded token budget with every draft", () => {
    const inputs: Array<Readonly<Record<string, unknown>>> = []
    return Effect.gen(function*() {
      yield* compile
      assert.strictEqual(inputs[0]?.["reasoning_effort"], "low")
      assert.strictEqual(inputs[0]?.["max_tokens"], 4096)
    }).pipe(Effect.provide(compilerWith(slowAi([0], [linear], inputs))))
  })
})
