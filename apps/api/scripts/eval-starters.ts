/**
 * Runs every prepared starter rule (src/guards/starters) through the real Clef classifier on Workers AI: its
 * onboarding sample (must score at least 0.7) and its benign calls (must stay well below), on the state the
 * onboarding test sends and on the state the gateway builds. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 *
 *   bun apps/api/scripts/eval-starters.ts [--write]
 *
 * --write records the questions and scores in src/guards/starters/recorded/clef-flash.json, which
 * `starters/catalog.test.ts` checks offline: CI never calls the model.
 */
import { Effect, Layer } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { Classifier } from "../src/guards/classifier"
import { classifierState } from "../src/guards/classifier-state"
import { questionFor } from "../src/guards/evaluation"
import { starters } from "../src/guards/starters/catalog"
import { compiledOf, type StarterCall } from "../src/guards/starters/starter"
import { resourceOf } from "../src/testing/gateway-fakes"
import { restAi } from "./eval/rest-ai"

const token = process.env.CLOUDFLARE_API_TOKEN
const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (!token || !account) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to run the starter eval against Workers AI.")
  process.exit(2)
}
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
const model = /"CLASSIFIER_MODEL":\s*"([^"]+)"/.exec(wrangler)?.[1] ?? "@cf/cloudflare/clef-flash"
const threshold = 0.7
const actor = { role: "member", teams: [] }
const workspace = resourceOf("res_workspace1", "Workspace tools", { kind: "mcp_server", url: "https://mcp.example.com/mcp", transport: "streamable_http" })

/** The onboarding test sends the sample as is; the gateway wraps it with the resource, account and redaction. */
const states = (call: StarterCall) => ({
  test: { tool: call.tool, arguments: call.arguments, actor },
  gateway: classifierState({ actor: { ...actor, type: "User", teamNames: [], project: null }, resource: workspace, tool: call.tool, arguments: call.arguments, connection: null })
})

const program = Effect.gen(function*() {
  const classifier = yield* Classifier
  const score = (question: string, state: unknown) => Effect.map(classifier.classify(state, new Map([["q", question]])), (scores) => scores.get("q") ?? 0)
  const cases = yield* Effect.forEach(starters, (starter) =>
    Effect.gen(function*() {
      const question = questionFor(compiledOf(starter))
      const labelled = [{ ...starter.sample, violates: true }, ...starter.benign.map((call) => ({ ...call, violates: false }))]
      const calls = yield* Effect.forEach(labelled, (call) =>
        Effect.all({ test: score(question, states(call).test), gateway: score(question, states(call).gateway) }).pipe(
          Effect.map((probability) => ({ tool: call.tool, arguments: call.arguments, note: call.note, violates: call.violates, probability }))
        ), { concurrency: 4 })
      return { id: starter.id, question, calls }
    }), { concurrency: 3 })
  let failures = 0
  for (const result of cases) {
    const [sample, ...benign] = result.calls
    const worst = Math.max(...benign.map((call) => call.probability.test))
    const ok = sample !== undefined && sample.probability.test >= threshold && worst < 0.3
    if (!ok) failures++
    console.log(`${ok ? "PASS" : "FAIL"} ${result.id.padEnd(30)} violating ${sample?.probability.test.toFixed(3)} (gateway ${sample?.probability.gateway.toFixed(3)})  worst benign ${worst.toFixed(3)} (gateway ${Math.max(...benign.map((call) => call.probability.gateway)).toFixed(3)})`)
    for (const call of result.calls.filter((c) => (c.violates ? c.probability.test < threshold : c.probability.test >= 0.3))) console.log(`     x ${call.probability.test.toFixed(3)} ${call.tool} ${JSON.stringify(call.arguments)}`)
  }
  console.log(`\n${cases.length - failures}/${cases.length} starters pass`)
  if (process.argv.includes("--write")) {
    const path = new URL("../src/guards/starters/recorded/clef-flash.json", import.meta.url)
    writeFileSync(path, `${JSON.stringify({ model, date: new Date().toISOString().slice(0, 10), threshold, note: "bun apps/api/scripts/eval-starters.ts --write; probability.test is the onboarding test's state, probability.gateway the gateway's.", cases }, null, 2)}\n`)
  }
})

Effect.runPromise(program.pipe(Effect.provide(Layer.effect(Classifier, Classifier.make(model)).pipe(Layer.provide(restAi(account, token))))))
