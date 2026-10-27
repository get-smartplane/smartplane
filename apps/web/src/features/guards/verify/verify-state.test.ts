import { type Guard, type GuardVerifyRun, type GuardVerifyStage, GuardId, OrgId, UserId } from "@pc/domain"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"
import { formatElapsed, pollingFor, StaleAfterMs, stepsFor } from "./verify-state"

const t0 = Date.UTC(2026, 9, 24, 12, 0, 0)
const at = (seconds: number) => DateTime.makeUnsafe(t0 + seconds * 1000)

/** A run through `stages`, each 5 s after the previous; `stage` defaults to the last. */
const runThrough = (stages: ReadonlyArray<GuardVerifyStage>, error?: string): GuardVerifyRun => ({
  runId: "vr_test",
  stage: stages.at(-1)!,
  startedAt: at(0),
  updatedAt: at((stages.length - 1) * 5),
  timeline: stages.map((stage, index) => ({ stage, at: at(index * 5) })),
  ...(error === undefined ? {} : { error })
})

const guardWith = (verify: GuardVerifyRun | null, extra: Partial<Guard> = {}): Guard => ({
  id: GuardId.make("grd_todolist01"), orgId: OrgId.make("org_testorg01"), projectId: null, resourceIds: [], name: "todo", nameFollowsRule: true, modeFollowsRule: false, applies: null,
  rule: "nobody can update todo list in notion", mode: "enforce", approvers: [], threshold: 0.5, status: "draft", compiled: null,
  compiledVersion: 0, testCalls: [], pins: [], verify, createdBy: UserId.make("usr_testuser01"), createdAt: at(0), updatedAt: null, ...extra
})

const states = (run: GuardVerifyRun) => stepsFor(run).map((step) => `${step.label}: ${step.state}`)

describe("the verify stepper", () => {
  it("shows a queued run as finding its tools, the rest pending, and no Improving row", () => {
    expect(states(runThrough(["queued"]))).toEqual([
      "Finding the tools it applies to: active",
      "Writing the check: pending",
      "Reviewing: pending",
      "Testing on example calls: pending",
      "Done: pending"
    ])
  })

  it("marks finished stages with their durations and the current one active", () => {
    const steps = stepsFor(runThrough(["queued", "finding_targets", "drafting", "reviewing"]))
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "active", "pending", "pending"])
    expect(steps[0]?.tookMs).toBe(5000)
    expect(steps[2]?.startedMs).toBe(t0 + 15_000)
  })

  it("adds Improving only when the run retried, and ends all done", () => {
    expect(states(runThrough(["queued", "finding_targets", "drafting", "reviewing", "testing", "retrying", "done"]))).toEqual([
      "Finding the tools it applies to: done",
      "Writing the check: done",
      "Reviewing: done",
      "Testing on example calls: done",
      "Improving: done",
      "Done: done"
    ])
  })

  it("shows a run waiting for a confirmation, then where a failed or cancelled run stopped", () => {
    expect(stepsFor(runThrough(["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation"])).map((s) => s.state)).toEqual(["done", "done", "done", "waiting", "pending", "pending"])
    expect(stepsFor(runThrough(["queued", "finding_targets", "drafting", "failed"], "slow")).map((s) => s.state)).toEqual(["done", "failed", "pending", "pending", "pending"])
    expect(stepsFor(runThrough(["queued", "finding_targets", "cancelled"])).map((s) => s.state)).toEqual(["cancelled", "pending", "pending", "pending", "pending"])
  })
})

describe("polling", () => {
  it("polls while a run works, waits for a person, stops when it ends or goes stale", () => {
    const now = t0 + 20_000
    expect(pollingFor(guardWith(runThrough(["queued", "finding_targets", "drafting"])), now)).toBe("poll")
    expect(pollingFor(guardWith(runThrough(["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation"])), now)).toBe("waiting")
    expect(pollingFor(guardWith(runThrough(["queued", "finding_targets", "drafting", "reviewing", "testing", "done"])), now)).toBe("idle")
    expect(pollingFor(guardWith(runThrough(["queued", "failed"])), now)).toBe("idle")
    expect(pollingFor(guardWith(runThrough(["queued", "finding_targets"])), t0 + 5000 + StaleAfterMs + 1)).toBe("stale")
    expect(pollingFor(guardWith(null), now)).toBe("idle")
  })

  it("still follows an older background self-test without a run", () => {
    const legacy = guardWith(null, { compiled: { instructions: "Q", examples: [], selfTest: { status: "running", startedAt: at(0), threshold: 0.5, calls: [], retried: false } } })
    expect(pollingFor(legacy, t0 + 1000)).toBe("poll")
  })

  it("formats elapsed time", () => {
    expect([formatElapsed(800), formatElapsed(42_000), formatElapsed(65_000)]).toEqual(["1 s", "42 s", "1:05"])
  })
})
