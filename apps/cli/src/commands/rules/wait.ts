import { type Guard, type GuardVerifyRun, type GuardVerifyStage, verifyActive, verifyStageLabel } from "@pc/domain"
import { DateTime, Duration, Effect } from "effect"
import type { Api } from "../../api/client"
import { note } from "../../app/output"

/** Same cadence as the dashboard. */
const PollEvery = Duration.millis(1500)
/** A run that has not ended by then is left running; `rules get` shows where it is. */
const GiveUpAfter = Duration.minutes(15)

const seconds = (from: DateTime.Utc, to: DateTime.Utc) => `${Math.max(0, Math.round((to.epochMilliseconds - from.epochMilliseconds) / 1000))} s`

/** One line per stage, as the rule page names them; `queued` is folded into the first. */
const stageLine = (stage: GuardVerifyStage) => `… ${verifyStageLabel[stage]}`

const endLine = (guard: Guard, run: GuardVerifyRun): string => {
  const took = seconds(run.startedAt, run.updatedAt)
  switch (run.stage) {
    case "done":
      return `✓ Done in ${took}. Review it with \`smartplane rules get ${guard.id}\`, then \`smartplane rules activate ${guard.id}\`.`
    case "failed":
      return `✗ Failed after ${took}: ${run.error ?? "verify could not finish"}`
    case "cancelled":
      return `= Cancelled after ${took}${run.error === undefined || run.error === "Cancelled." ? "" : `: ${run.error}`}`
    default:
      return `… Still ${verifyStageLabel[run.stage].toLowerCase()} after ${took}; check later with \`smartplane rules get ${guard.id}\`.`
  }
}

const confirmLines = (guard: Guard): ReadonlyArray<string> => {
  const lookup = guard.compiled?.pinning
  return [
    `? The rule names “${lookup?.mention ?? "something specific"}”. Which one is it?`,
    ...(lookup?.candidates ?? []).map((candidate) => `    ${candidate.label} (${candidate.kind}) ${candidate.entityId}`),
    "  Pin it in the dashboard, or test without pinning:",
    `    smartplane rules verify ${guard.id} --continue`
  ]
}

/**
 * Follows a verify run to its end, printing each stage as it starts (to stderr, like all progress) and
 * returns the guard as it ended. Stops early at `needs_confirmation`: a person has to choose what the rule names.
 */
export const waitForVerify = (client: Api, started: Guard) =>
  Effect.gen(function*() {
    let guard = started
    let printed = 0
    const deadline = DateTime.addDuration(yield* DateTime.now, GiveUpAfter)
    while (true) {
      const run = guard.verify
      if (run === null) return guard
      const stages = run.timeline.map((step) => step.stage).filter((stage) => stage !== "queued" && verifyActive({ ...run, stage }))
      for (const stage of stages.slice(printed)) yield* note(stageLine(stage))
      printed = Math.max(printed, stages.length)
      if (run.stage === "needs_confirmation") {
        for (const line of confirmLines(guard)) yield* note(line)
        return guard
      }
      if (!verifyActive(run) || DateTime.isGreaterThan(yield* DateTime.now, deadline)) {
        yield* note(endLine(guard, run))
        return guard
      }
      yield* Effect.sleep(PollEvery)
      guard = yield* client.guards.get({ params: { id: guard.id } })
    }
  })
