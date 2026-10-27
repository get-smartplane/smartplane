import { accountModeOf, type CompiledGuard, type GuardTestedCall, type GuardToolCall, type Resource, scoreSelfTest } from "@pc/domain"
import { Effect } from "effect"
import { Classifier } from "../../src/guards/classifier"
import { classifierState } from "../../src/guards/classifier-state"
import { evalDirectory } from "../../src/guards/compile/eval-set"
import { type GroundedCase, groundedEvalSet, groundedResources, groundedTools } from "../../src/guards/compile/grounded-eval-set"
import { GuardCompiler } from "../../src/guards/compiler"
import { questionFor } from "../../src/guards/evaluation"
import { ExampleCalls } from "../../src/guards/examples/example-calls"
import { compactJson } from "../../src/guards/grounding/compact"
import { productName } from "../../src/guards/grounding/products"
import { rankTools } from "../../src/guards/grounding/rank"
import type { ToolDoc } from "../../src/guards/grounding/tool-doc"
import { draftQuestion, draftTestAndRetry, runSelfTest } from "../../src/guards/self-test/run"
import { exampleTools } from "../../src/guards/verify"

const threshold = 0.5
const actor = { type: "User", email: "agent-test@smartplane.invalid", role: "member", teams: [], teamNames: [], project: null }

export const groundedOrgContext = `Resources:\n${groundedResources.map((r) => `- ${r.config.kind} "${r.name}": ${r.description}`).join("\n")}\n`

/** The state the evaluator built before this change: no product, no tool title or description, no hints. */
const legacyState = (resource: Resource, tool: string, args: unknown) => ({
  actor,
  resource: { kind: resource.config.kind, name: resource.name, description: resource.description, accountMode: accountModeOf(resource.config) },
  connection: null,
  tool,
  arguments: args
})

export const classifyCalls = (question: string, calls: ReadonlyArray<GuardToolCall>, resource: Resource, docs: ReadonlyArray<ToolDoc>, grounded: boolean) =>
  Effect.gen(function*() {
    const classifier = yield* Classifier
    return yield* Effect.forEach(calls, (call) => {
      const doc = docs.find((candidate) => candidate.gatewayName === call.tool)
      const tool = doc?.name ?? call.tool.split("__").at(-1) ?? call.tool
      const state = grounded
        ? classifierState({ actor, resource, tool, toolInfo: { gatewayName: call.tool, title: doc?.title, description: doc === undefined ? undefined : `[${resource.name}] ${doc.description}` }, arguments: call.arguments, connection: null })
        : legacyState(resource, tool, call.arguments)
      return classifier.classify(state, new Map([["q", question]])).pipe(
        Effect.map((scores): GuardTestedCall => {
          const probability = scores.get("q") ?? 0
          return { ...call, source: "custom", probability, triggered: probability >= threshold }
        })
      )
    }, { concurrency: 4 })
  })

export interface GroundedResult {
  readonly name: string
  readonly rule: string
  readonly product: string
  readonly before: { readonly question: string; readonly calls: ReadonlyArray<GuardTestedCall> }
  readonly after: { readonly question: string; readonly calls: ReadonlyArray<GuardTestedCall>; readonly selfTest: ReadonlyArray<GuardTestedCall>; readonly retried: boolean; readonly generated: number }
}

/**
 * One case, before and after. Before: the rule compiled without tools (or the question the previous
 * compiler produced, when given), judged on the old classifier state. After: the grounded verify flow
 * (ranked real tools, generated example calls, self-test with one retry), judged on the new state. The
 * labelled calls are held out of the self-test either way.
 */
export const runGroundedCase = (testCase: GroundedCase, beforeQuestion?: string) =>
  Effect.gen(function*() {
    const compiler = yield* GuardCompiler
    const examples = yield* ExampleCalls
    const classifier = yield* Classifier
    const docs = (yield* groundedTools).get(testCase.resource.id) ?? []
    const ranked = rankTools(testCase.rule, docs)

    const before: CompiledGuard | undefined = beforeQuestion === undefined ? yield* compiler.compile(testCase.rule, groundedOrgContext, evalDirectory) : undefined
    const oldQuestion = beforeQuestion ?? (before === undefined ? "" : questionFor(before))
    const beforeCalls = yield* classifyCalls(oldQuestion, testCase.calls, testCase.resource, docs, false)

    const generated = yield* examples.forRule(testCase.rule, exampleTools(ranked))
    const world = { resources: new Map([[testCase.resource.id, testCase.resource]]), tools: new Map(docs.map((doc) => [doc.gatewayName, doc])), threshold }
    const tested = yield* draftTestAndRetry(
      (feedback) => compiler.compileDraft(testCase.rule, groundedOrgContext, evalDirectory, { tools: ranked, ...(feedback === undefined ? {} : { feedback }) }),
      (draft) => runSelfTest(classifier, draftQuestion(draft), [...generated.map((call) => ({ call, source: "generated" as const })), ...draft.calls.map((call) => ({ call, source: "draft" as const }))], world).pipe(Effect.orElseSucceed(() => undefined))
    )
    const newQuestion = draftQuestion(tested.draft)
    const afterCalls = yield* classifyCalls(newQuestion, testCase.calls, testCase.resource, docs, true)
    return {
      name: testCase.name,
      rule: testCase.rule,
      product: productName(testCase.resource),
      before: { question: oldQuestion, calls: beforeCalls },
      after: { question: newQuestion, calls: afterCalls, selfTest: tested.calls ?? [], retried: tested.retried, generated: generated.length }
    } satisfies GroundedResult
  })

const line = (calls: ReadonlyArray<GuardTestedCall>) => {
  const s = scoreSelfTest(calls)
  return `caught ${s.caught}/${s.violating}, allowed ${s.allowed}/${s.allowedTotal}`
}

export const printGrounded = (results: ReadonlyArray<GroundedResult>) => {
  const all = { before: [] as Array<GuardTestedCall>, after: [] as Array<GuardTestedCall> }
  for (const result of results) {
    all.before.push(...result.before.calls)
    all.after.push(...result.after.calls)
    console.log(`\n${result.name}: "${result.rule}"  [${result.product}]`)
    console.log(`  before: ${line(result.before.calls)}`)
    console.log(`  after:  ${line(result.after.calls)}  (self-test ${line(result.after.selfTest)} on ${result.after.selfTest.length} calls, ${result.after.generated} generated${result.after.retried ? ", retried" : ""})`)
    console.log(`  Q: ${result.after.question.split("\n")[0]}`)
    for (const call of result.after.calls.filter((c) => c.triggered !== c.violates)) {
      console.log(`  x ${call.violates ? "missed " : "blocked"} ${(call.probability * 100).toFixed(0)}% ${call.tool} ${compactJson(call.arguments, 120)}`)
    }
  }
  console.log(`\nGrounded cases, before: ${line(all.before)}  |  after: ${line(all.after)}`)
}

export { groundedEvalSet }
