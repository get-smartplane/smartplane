import { type CompiledGuard, GuardId, type GuardTestedCall, scoreSelfTest } from "@pc/domain"
import { Effect } from "effect"
import { Classifier } from "../../src/guards/classifier"
import { classifierState } from "../../src/guards/classifier-state"
import { evalDirectory } from "../../src/guards/compile/eval-set"
import { groundedTools, notion } from "../../src/guards/compile/grounded-eval-set"
import { neverReadCall, pinnedCalls, priorReads, todoPin } from "../../src/guards/compile/pinned-eval-set"
import { GuardCompiler } from "../../src/guards/compiler"
import { questionFor } from "../../src/guards/evaluation"
import { compactJson } from "../../src/guards/grounding/compact"
import { rankTools } from "../../src/guards/grounding/rank"
import { contextLine, pinnedContext, pinView } from "../../src/guards/pinning/context"
import { CreateInPinProbability, createsInPin } from "../../src/guards/pinning/create-in-pin"
import { harvestChildren, resultValues } from "../../src/guards/pinning/harvest"
import { groundedOrgContext } from "./grounded"

const threshold = 0.5
const actor = { type: "User", email: "agent-test@smartplane.invalid", role: "member", teams: [], teamNames: [], project: null }
const rule = "nobody can update todo list in notion"
const guardId = GuardId.make("grd_evalpin01")

/** The guard as the evaluator sees it, pinned or not. */
const guardWith = (compiled: CompiledGuard, pinned: boolean) => ({
  id: guardId, orgId: notion.orgId, projectId: null, resourceIds: [], name: rule, nameFollowsRule: true, modeFollowsRule: false, applies: null, rule, mode: "enforce" as const,
  approvers: [], threshold, status: "active" as const, compiled, compiledVersion: 1, testCalls: [], pins: pinned ? [todoPin] : [], verify: null,
  createdBy: todoPin.pinnedBy, createdAt: todoPin.pinnedAt, updatedAt: null
})

/**
 * The pinning eval: one compiled question for the founder's rule, judged by Clef on id-only calls with and
 * without the Todo pin. With the pin, the prior reads are harvested first (the real harvest code), then each
 * call is scanned and told to the classifier the way the evaluator does it.
 */
export const runPinned = Effect.gen(function*() {
  const compiler = yield* GuardCompiler
  const classifier = yield* Classifier
  const docs = (yield* groundedTools).get(notion.id) ?? []
  const compiled = yield* compiler.compile(rule, groundedOrgContext, evalDirectory, { tools: rankTools(rule, docs) })

  const children = new Set<string>()
  for (const read of priorReads) {
    const view = pinView([guardWith(compiled, true)], notion.id, new Map([[todoPin.id, children]]), read.arguments)
    const found = harvestChildren(resultValues({ content: [{ type: "text", text: read.text }] }), view.known, view.calledOn)
    for (const id of found.get(todoPin.id) ?? []) children.add(id)
  }

  /** `positive`: context only on calls that match the pin; `both`: also "no id matches Todo" on the others (what the evaluator does). */
  const judge = (pinned: boolean, lines: "positive" | "both" = "both") => (call: typeof pinnedCalls[number]) => {
    const doc = docs.find((candidate) => candidate.gatewayName === call.tool)
    const view = pinned ? pinView([guardWith(compiled, true)], notion.id, new Map([[todoPin.id, children]]), call.arguments, "Notion") : undefined
    const touches = view?.touches.get(guardId)
    const line = view === undefined || (lines === "positive" && touches === undefined) ? undefined : contextLine(view, guardId)
    const question = line === undefined ? questionFor(compiled) : `${questionFor(compiled)}\n\n${line}`
    const state = classifierState({
      actor, resource: notion, tool: doc?.name ?? call.tool, connection: null, arguments: call.arguments,
      toolInfo: { gatewayName: call.tool, title: doc?.title, description: doc === undefined ? undefined : `[${notion.name}] ${doc.description}` },
      pinned: view === undefined || (lines === "positive" && touches === undefined) ? undefined : pinnedContext(view)
    })
    // The evaluator's deterministic rule: a create whose destination is the pin (or its data source) needs no classifier.
    const certain = view !== undefined && createsInPin({ tool: doc?.name ?? call.tool, access: doc?.access, arguments: call.arguments, operations: compiled.operations }, view.pinsOf.get(guardId) ?? []) !== undefined
    return Effect.map(classifier.classify(state, new Map([["q", question]])), (scores): GuardTestedCall & { readonly touched: boolean; readonly certain: boolean; readonly clef: number } => {
      const clef = scores.get("q") ?? 0
      const probability = certain ? CreateInPinProbability : clef
      return { ...call, source: "custom", probability, triggered: probability >= threshold, touched: touches !== undefined, certain, clef }
    })
  }
  const all = [...pinnedCalls, neverReadCall]
  const before = yield* Effect.forEach(all, judge(false), { concurrency: 4 })
  const positive = yield* Effect.forEach(all, judge(true, "positive"), { concurrency: 4 })
  const after = yield* Effect.forEach(all, judge(true), { concurrency: 4 })
  return { question: compiled.instructions, operations: compiled.operations ?? [], harvested: children.size, before, positive, after }
})

const line = (calls: ReadonlyArray<GuardTestedCall>) => {
  const s = scoreSelfTest(calls)
  return `caught ${s.caught}/${s.violating}, allowed ${s.allowed}/${s.allowedTotal}`
}

export const printPinned = (result: Effect.Success<typeof runPinned>) => {
  const main = <A extends GuardTestedCall>(calls: ReadonlyArray<A>) => calls.slice(0, -1)
  console.log(`\nPinned Todo eval: "${rule}"  (${result.harvested} rows harvested from prior reads)`)
  console.log(`  Q: ${result.question.split("\n")[0]}`)
  console.log(`  operations read from the rule: ${result.operations.join(", ") || "none"}`)
  console.log(`  before (no pin): ${line(main(result.before))}`)
  console.log(`  pinned, context on matching calls only: ${line(main(result.positive))}`)
  console.log(`  after  (pinned): ${line(main(result.after))}`)
  for (const [label, calls] of [["before", result.before], ["matches only", result.positive], ["after", result.after]] as const) {
    const never = calls.at(-1)!
    console.log(`  never-read row, ${label}: ${never.triggered ? "caught" : "missed"} (${(never.probability * 100).toFixed(0)}%)`)
  }
  for (const call of main(result.after)) {
    const before = result.before.find((b) => b.note === call.note)
    const positive = result.positive.find((b) => b.note === call.note)
    const pct = (p: number | undefined) => `${((p ?? 0) * 100).toFixed(0).padStart(3)}%`
    console.log(`  ${call.violates ? "breaks " : "allowed"} ${pct(before?.probability)} / ${pct(positive?.probability)} / ${pct(call.probability)}${call.touched ? " [pinned]" : ""}${call.certain ? ` [create in pin; Clef ${pct(call.clef)}]` : ""}  ${call.note}  ${compactJson(call.arguments, 90)}`)
  }
}
