import { type Guard, type GuardMode, selfTestSummary, verifyStageLabel } from "@pc/domain"
import { details, tableOr } from "../../app/table"

/** `approval` on the command line, `require_approval` in the contract. */
export const modeChoices = [["enforce", "enforce"], ["monitor", "monitor"], ["approval", "require_approval"]] as const

export const modeLabel = (mode: GuardMode): string => (mode === "require_approval" ? "approval" : mode)

const percent = (value: number) => `${Math.round(value * 100)}%`

export const ruleTable = (guards: ReadonlyArray<Guard>) =>
  tableOr(
    "No rules.",
    ["id", "name", "mode", "status", "threshold", "scope", "rule"],
    guards.map((g) => [g.id, g.name, modeLabel(g.mode), g.status, percent(g.threshold), g.projectId ?? "org", g.rule])
  )

/** The background self-test: `running` until it finishes (see `rules get`), then its score. */
const selfTestLine = (guard: Guard): string => {
  const selfTest = guard.compiled?.selfTest
  if (selfTest === undefined) return "not run"
  if (selfTest.status === "running" || selfTest.status === "failed") return selfTest.status
  return selfTestSummary(selfTest)
}

/** The latest verify run: where it is, or how it ended. */
const verifyLine = (guard: Guard): string => {
  const run = guard.verify
  if (run === null) return "never run"
  return `${verifyStageLabel[run.stage]}${run.error === undefined ? "" : ` (${run.error})`} · ${run.runId}`
}

export const ruleDetails = (guard: Guard) =>
  [
    details([
      ["id", guard.id],
      ["name", guard.name],
      ["rule", guard.rule],
      ["mode", modeLabel(guard.mode)],
      ["status", guard.status],
      ["threshold", percent(guard.threshold)],
      ["scope", `${guard.projectId ?? "org"}, ${guard.resourceIds.length === 0 ? "every resource" : guard.resourceIds.join(",")}`],
      ["version", guard.compiledVersion],
      ["verify", verifyLine(guard)],
      ["self-test", selfTestLine(guard)],
      ["pinned to", guard.pins.length === 0 ? "nothing" : guard.pins.map((pin) => `${pin.label} (${pin.kind})${pin.missing === true ? " [not found]" : ""}`).join(", ")]
    ]),
    ...(guard.compiled === null ? [] : [
      "",
      "Classifier instructions (review before activating):",
      guard.compiled.instructions,
      ...guard.compiled.examples.map((example) => `  ${example.violates ? "violates" : "allowed "}  ${example.action}`)
    ])
  ].join("\n")
