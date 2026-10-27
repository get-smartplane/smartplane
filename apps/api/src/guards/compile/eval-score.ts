import { type CompiledGuard, sameApprovers } from "@pc/domain"
import type { EvalCase } from "./eval-set"
import { reviewDraft } from "./review"

export interface EvalCheck {
  readonly name: string
  readonly pass: boolean
  readonly detail: string
}

const includesAny = (text: string, words: ReadonlyArray<string>) => words.some((word) => text.includes(word.toLowerCase()))

/** Scores one compiled draft against an eval case: specificity, leaks, mode, approvers and examples. */
export const scoreCase = (testCase: EvalCase, compiled: CompiledGuard): ReadonlyArray<EvalCheck> => {
  const instructions = compiled.instructions.toLowerCase()
  const examples = compiled.examples.map((example) => ({ ...example, text: example.action.toLowerCase() }))
  const missing = testCase.mustMention.filter((group) => !includesAny(instructions, group)).map((group) => group.join("|"))
  const leaked = testCase.mustNotMention.filter((word) => instructions.includes(word.toLowerCase()))
  const badExamples = examples.filter((e) => includesAny(e.text, testCase.examplesMustNotMention ?? []))
  const offTopic = examples.filter((e) => !includesAny(e.text, testCase.topic))
  const mislabelled = examples.filter((e) => e.violates && includesAny(e.text, testCase.nearMisses ?? []))
  const suggestion = compiled.suggestion
  const issues = reviewDraft(testCase.rule, suggestion?.mode ?? "enforce", compiled)
  return [
    { name: "specific", pass: missing.length === 0, detail: missing.length === 0 ? "" : `missing ${missing.join(", ")}` },
    { name: "no leaks", pass: leaked.length === 0, detail: leaked.join(", ") },
    { name: "mode", pass: suggestion?.mode === testCase.mode, detail: `${suggestion?.mode ?? "no suggestion"} (want ${testCase.mode})` },
    {
      name: "approvers",
      pass: sameApprovers(suggestion?.approvers ?? [], testCase.approvers ?? []),
      detail: JSON.stringify(suggestion?.approvers ?? null)
    },
    { name: "examples relevant", pass: offTopic.length === 0 && badExamples.length === 0, detail: [...offTopic, ...badExamples].map((e) => e.action).join(" | ") },
    { name: "near misses allowed", pass: mislabelled.length === 0, detail: mislabelled.map((e) => e.action).join(" | ") },
    { name: "review clean", pass: issues.length === 0, detail: issues.map((issue) => issue.code).join(", ") }
  ]
}
