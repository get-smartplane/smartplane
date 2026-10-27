/**
 * Compares compiler models on the wording and grounded eval sets: quality, per-draft latency (p50/p95) and
 * Workers AI cost in neurons. Runs the production compile path (one draft, one correction when the review
 * finds problems) with a generous timeout so the real latency shows, and counts drafts past the production
 * timeout. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 *
 *   bun apps/api/scripts/eval-models.ts <model[:effort]> ... [--shots 1|3] [--json out.json]
 *   e.g. @cf/zai-org/glm-5.3-flash:low @cf/openai/gpt-oss-120b:low @cf/mistralai/mistral-small-3.1-24b-instruct
 *
 * Results (2026-10-23, trimmed prompt, 1 worked example, one at a time; wording = checks passed, grounded =
 * violations caught / near misses allowed by Clef on the held-out calls, latency per draft):
 *
 *   model                         wording  grounded       p50    p95    neurons/draft
 *   glm-5.3-flash, low            95/98    15/18  14/17   4.8 s  27.9 s   29
 *   glm-5.3-flash, medium         93/98     6/18   9/17  28.3 s  72.6 s  103   (parallel run)
 *   mistral-small-3.1-24b         93/98    12/18  17/17   3.0 s   4.7 s   54
 *   mistral-small-3.1-24b (rerun) 90/98    11/18  17/17   2.9 s   5.0 s   55
 *   mistral-small-3.1-24b, 3 shot 94/98    10/18  14/17   3.3 s   7.0 s   68
 *   gpt-oss-120b, low             95/98    17/18  16/17  11.8 s  33.5 s  131
 *   gpt-oss-20b, low              87/92     9/18  14/17  21.9 s  51.7 s   83
 *   deepseek-v4-flash, low        86/92    12/18  14/17  17.0 s  48.1 s  237
 *   deepseek-v4.1-flash, low      97/98    18/18  15/17  12.0 s  20.7 s  143   <- COMPILER_MODEL and BACKGROUND_MODEL
 *   qwen3.8-27b, low              95/98    15/18  17/17  16.6 s  88.1 s  345
 *   gemma-4-26b-a4b, low           0/14     2/18   3/17  76.0 s 107.9 s  116   (no usable JSON)
 *
 * DeepSeek V4.1 Flash, the best on both sets, drafts on the request too (2026-10-24 rerun as the compiler:
 * wording 97/98, grounded 15/18 caught 17/17 allowed, p50 10.7 s, p95 36 s): a draft gets 30 s and both drafts
 * 55 s, well inside the 100 s edge limit. Mistral Small was faster but clearly weaker on grounded rules.
 */
import { type GuardTestedCall, scoreSelfTest } from "@pc/domain"
import { Duration, Effect, Layer } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { Classifier } from "../src/guards/classifier"
import { evalDirectory, evalOrgContext, evalSet } from "../src/guards/compile/eval-set"
import { scoreCase } from "../src/guards/compile/eval-score"
import { fewShot } from "../src/guards/compile/few-shot"
import { groundedEvalSet, groundedTools } from "../src/guards/compile/grounded-eval-set"
import { GuardCompiler } from "../src/guards/compiler"
import { rankTools } from "../src/guards/grounding/rank"
import { compileCall, type ReasoningEffort } from "../src/guards/model-call"
import { WorkersAi } from "../src/platform/ai"
import { classifyCalls, groundedOrgContext } from "./eval/grounded"
import { restAi } from "./eval/rest-ai"

const token = process.env.CLOUDFLARE_API_TOKEN
const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (!token || !account) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.")
  process.exit(2)
}
const args = process.argv.slice(2)
const flag = (name: string) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined)
const jsonPath = flag("--json")
const shots = Number(flag("--shots") ?? "1")
/** One at a time by default: production verifies one rule at a time, and parallel calls queue at Workers AI. */
const concurrency = Number(flag("--concurrency") ?? "1")
const variants = args.filter((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"))
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
const classifierModel = /"CLASSIFIER_MODEL":\s*"([^"]+)"/.exec(wrangler)?.[1] ?? "@cf/cloudflare/clef-flash"

/** USD per million input / output tokens (Workers AI model catalog, Oct 2026); 1,000 neurons cost $0.011. */
const prices: Record<string, readonly [number, number]> = {
  "@cf/zai-org/glm-5.3-flash": [0.15, 0.5],
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [0.351, 0.555],
  "@cf/openai/gpt-oss-120b": [0.35, 0.75],
  "@cf/openai/gpt-oss-20b": [0.2, 0.3],
  "@cf/deepseek-ai/deepseek-v4-flash-0731": [0.44, 1.32],
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017": [0.3, 1.2],
  "@cf/qwen/qwen3.8-27b": [0.45, 3.2],
  "@cf/google/gemma-4-26b-a4b-it": [0.1, 0.3]
}
const neurons = (model: string, input: number, output: number) => {
  const [inPrice, outPrice] = prices[model] ?? [0, 0]
  return ((input * inPrice + output * outPrice) / 1e6 / 0.011) * 1000
}

interface Sample { readonly ms: number; readonly neurons: number; readonly ok: boolean }
const usageOf = (raw: unknown): readonly [number, number] => {
  const usage = typeof raw === "object" && raw !== null && "usage" in raw && typeof raw.usage === "object" && raw.usage !== null ? raw.usage : {}
  const read = (key: string) => (key in usage ? Number((usage as Record<string, unknown>)[key]) || 0 : 0)
  return [read("prompt_tokens"), read("completion_tokens")]
}

/** Workers AI over REST, recording latency and token cost of every compiler call. */
const recording = (samples: Array<Sample>, model: string) =>
  Layer.effect(WorkersAi, Effect.gen(function*() {
    const inner = yield* WorkersAi
    return {
      run: (name: string, input: Readonly<Record<string, unknown>>) => {
        if (name !== model) return inner.run(name, input)
        const started = Date.now()
        return inner.run(name, input).pipe(
          Effect.tap((raw) => Effect.sync(() => samples.push({ ms: Date.now() - started, neurons: neurons(model, ...usageOf(raw)), ok: true }))),
          Effect.tapError(() => Effect.sync(() => samples.push({ ms: Date.now() - started, neurons: 0, ok: false })))
        )
      }
    }
  })).pipe(Layer.provide(restAi(account, token)))

const percentile = (values: ReadonlyArray<number>, p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
}

const runVariant = (variant: string) => {
  const [model = "", effort] = variant.split(":")
  const samples: Array<Sample> = []
  const base = compileCall(model)
  const call = { ...base, timeout: Duration.seconds(120), ...(effort === undefined ? {} : effort === "none" ? { reasoning: undefined } : { reasoning: effort as ReasoningEffort }) }
  const services = Layer.mergeAll(
    Layer.effect(GuardCompiler, GuardCompiler.make(call, fewShot.slice(0, shots))),
    Layer.effect(Classifier, Classifier.make(classifierModel))
  ).pipe(Layer.provide(recording(samples, model)))

  const program = Effect.gen(function*() {
    const compiler = yield* GuardCompiler
    const wording = yield* Effect.forEach(evalSet, (testCase) =>
      compiler.compile(testCase.rule, evalOrgContext, evalDirectory).pipe(
        Effect.map((compiled) => scoreCase(testCase, compiled)),
        Effect.catch(() => Effect.succeed([{ name: "compiled", pass: false, detail: "" }]))
      ), { concurrency })
    const tools = yield* groundedTools
    const grounded = yield* Effect.forEach(groundedEvalSet, (testCase) =>
      Effect.gen(function*() {
        const docs = tools.get(testCase.resource.id) ?? []
        const drafted = yield* compiler.compileDraft(testCase.rule, groundedOrgContext, evalDirectory, { tools: rankTools(testCase.rule, docs) })
        const question = drafted.compiled.examples.length === 0 ? drafted.compiled.instructions
          : `${drafted.compiled.instructions}\n\nExamples:\n${drafted.compiled.examples.map((e) => `- ${e.violates ? "VIOLATES" : "OK"}: ${e.action}`).join("\n")}`
        return yield* classifyCalls(question, testCase.calls, testCase.resource, docs, true)
      }).pipe(Effect.catch(() => Effect.succeed(testCase.calls.map((c): GuardTestedCall => ({ ...c, source: "custom", probability: c.violates ? 0 : 1, triggered: !c.violates }))))),
    { concurrency })
    const checks = wording.flat()
    const calls = grounded.flat()
    const score = scoreSelfTest(calls)
    const ms = samples.filter((s) => s.ok).map((s) => s.ms)
    return {
      variant,
      wording: { passed: checks.filter((c) => c.pass).length, total: checks.length, perfect: wording.filter((r) => r.every((c) => c.pass)).length, rules: wording.length },
      grounded: { caught: score.caught, violating: score.violating, allowed: score.allowed, allowedTotal: score.allowedTotal },
      drafts: samples.length,
      failed: samples.filter((s) => !s.ok).length,
      overProductionTimeout: ms.filter((m) => m > Duration.toMillis(base.timeout)).length,
      p50: percentile(ms, 50),
      p95: percentile(ms, 95),
      neuronsPerDraft: samples.length === 0 ? 0 : samples.reduce((sum, s) => sum + s.neurons, 0) / samples.length
    }
  })
  return program.pipe(Effect.provide(services))
}

const main = Effect.gen(function*() {
  const results = []
  for (const variant of variants) {
    const result = yield* runVariant(variant)
    results.push(result)
    const g = result.grounded
    console.log(`${variant} [${shots} shot]  wording ${result.wording.passed}/${result.wording.total} (${result.wording.perfect}/${result.wording.rules} perfect)  grounded caught ${g.caught}/${g.violating} allowed ${g.allowed}/${g.allowedTotal}  p50 ${(result.p50 / 1000).toFixed(1)}s p95 ${(result.p95 / 1000).toFixed(1)}s  ${result.neuronsPerDraft.toFixed(0)} neurons/draft  drafts ${result.drafts} failed ${result.failed} >12s ${result.overProductionTimeout}`)
  }
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ classifierModel, shots, results }, null, 2))
})

Effect.runPromise(main)
