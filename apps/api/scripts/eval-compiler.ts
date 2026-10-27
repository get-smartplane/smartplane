/**
 * Runs the guard compiler evals against Workers AI through the REST API, using the same compiler, example
 * generator, self-test and classifier code as the Worker. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 *
 *   bun apps/api/scripts/eval-compiler.ts [model] [--json results.json] [--only wording|grounded|pinned] [--before questions.json]
 *
 * Two sets: the wording eval (specific questions, no leaked examples, mode and approvers) and the grounded
 * eval (rules about Notion, Linear, GitHub and Slack judged by Clef on realistic tool calls, before and after
 * grounding), plus the pinning eval (the Notion rule with its Todo database pinned: id-only calls before and after
 * pinning and harvesting). The baseline questions come from `src/guards/compile/recorded/grounded-before.json`, written by
 * the compiler before grounding; `--before` takes another `{ "<case name>": "<question>" }` file.
 * The model defaults to COMPILER_MODEL from wrangler.jsonc, the classifier to CLASSIFIER_MODEL.
 */
import { Duration, Effect, Layer } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { Classifier } from "../src/guards/classifier"
import { evalDirectory, evalOrgContext, evalSet } from "../src/guards/compile/eval-set"
import { scoreCase } from "../src/guards/compile/eval-score"
import { GuardCompiler } from "../src/guards/compiler"
import { compileCall } from "../src/guards/model-call"
import { ExampleCalls } from "../src/guards/examples/example-calls"
import { memoryKv } from "../src/testing/gateway-fakes"
import { groundedEvalSet, printGrounded, runGroundedCase } from "./eval/grounded"
import { printPinned, runPinned } from "./eval/pinned"
import { restAi } from "./eval/rest-ai"

const token = process.env.CLOUDFLARE_API_TOKEN
const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (!token || !account) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to run the compiler eval against Workers AI.")
  process.exit(2)
}
const args = process.argv.slice(2)
const flag = (name: string) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined)
const jsonPath = flag("--json")
const only = flag("--only")
const beforePath = flag("--before")
const flagValues = new Set([jsonPath, only, beforePath])
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
const model = args.find((arg) => !arg.startsWith("--") && !flagValues.has(arg)) ?? /"COMPILER_MODEL":\s*"([^"]+)"/.exec(wrangler)?.[1] ?? ""
const classifierModel = /"CLASSIFIER_MODEL":\s*"([^"]+)"/.exec(wrangler)?.[1] ?? "@cf/cloudflare/clef-flash"
// The baseline: questions the compiler before grounding (commit a25e95b) wrote for these rules, recorded once.
const beforeQuestions: Record<string, string> = JSON.parse(readFileSync(beforePath ?? new URL("../src/guards/compile/recorded/grounded-before.json", import.meta.url), "utf8"))

const wording = Effect.gen(function*() {
  const compiler = yield* GuardCompiler
  console.log(`Compiler eval: ${evalSet.length} rules on ${model}\n`)
  const results = yield* Effect.forEach(evalSet, (testCase) =>
    compiler.compile(testCase.rule, evalOrgContext, evalDirectory).pipe(
      Effect.map((compiled) => ({ rule: testCase.rule, compiled, checks: scoreCase(testCase, compiled) })),
      Effect.catch((error) => Effect.succeed({ rule: testCase.rule, compiled: null, checks: [{ name: "compiled", pass: false, detail: error.message }] }))
    ), { concurrency: 4 })
  let passed = 0
  let total = 0
  for (const result of results) {
    const ok = result.checks.filter((check) => check.pass).length
    passed += ok
    total += result.checks.length
    console.log(`${ok === result.checks.length ? "PASS" : "FAIL"} ${ok}/${result.checks.length}  ${result.rule}`)
    if (result.compiled) console.log(`     Q: ${result.compiled.instructions}`)
    for (const check of result.checks.filter((c) => !c.pass)) console.log(`     x ${check.name}: ${check.detail}`)
  }
  const perfect = results.filter((r) => r.checks.every((c) => c.pass)).length
  console.log(`\n${passed}/${total} checks, ${perfect}/${results.length} rules fully correct`)
  return results
})

const grounded = Effect.gen(function*() {
  console.log(`\nGrounded eval: ${groundedEvalSet.length} rules, compiler ${model}, classifier ${classifierModel}`)
  const results = (yield* Effect.forEach(groundedEvalSet, (testCase) =>
    runGroundedCase(testCase, beforeQuestions[testCase.name] ?? beforeQuestions[testCase.rule]).pipe(
      Effect.map((result) => [result]),
      Effect.catch((error) => Effect.as(Effect.sync(() => console.log(`FAILED ${testCase.name}: ${error.message}`)), []))
    ), { concurrency: 5 })).flat()
  printGrounded(results)
  return results
})

const program = Effect.gen(function*() {
  const wordingResults = only === "grounded" || only === "pinned" ? [] : yield* wording
  const groundedResults = only === "wording" || only === "pinned" ? [] : yield* grounded
  const pinnedResult = only === undefined || only === "pinned" ? yield* runPinned : undefined
  if (pinnedResult !== undefined) printPinned(pinnedResult)
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ model, classifierModel, results: wordingResults, grounded: groundedResults, pinned: pinnedResult }, null, 2))
})

const ai = restAi(account, token)
const services = Layer.mergeAll(
  // Quality, not latency, is measured here (scripts/eval-models.ts measures latency): a generous timeout.
  Layer.effect(GuardCompiler, GuardCompiler.make({ ...compileCall(model), timeout: Duration.seconds(90) })),
  Layer.effect(Classifier, Classifier.make(classifierModel)),
  Layer.effect(ExampleCalls, ExampleCalls.make(model)).pipe(Layer.provide(memoryKv()))
).pipe(Layer.provide(ai))

Effect.runPromise(program.pipe(Effect.provide(services)))
