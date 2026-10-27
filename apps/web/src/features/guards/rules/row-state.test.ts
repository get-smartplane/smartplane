import { type CompiledGuard, type Guard, type GuardVerifyRun, type GuardVerifyStage, GuardId, OrgId, UserId } from "@pc/domain"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"
import { rowState } from "./row-state"

const t0 = Date.UTC(2026, 9, 24, 12, 0, 0)
const at = (seconds: number) => DateTime.makeUnsafe(t0 + seconds * 1000)
const run = (stages: ReadonlyArray<GuardVerifyStage>): GuardVerifyRun => ({
  runId: "vr_test", stage: stages.at(-1)!, startedAt: at(0), updatedAt: at((stages.length - 1) * 5), timeline: stages.map((stage, index) => ({ stage, at: at(index * 5) }))
})
const compiled: CompiledGuard = { instructions: "Does it?", examples: [], suggestion: { mode: "enforce", approvers: [], unresolved: [], cue: "nobody" } }
const guard = (extra: Partial<Guard> = {}): Guard => ({
  id: GuardId.make("grd_todolist01"), orgId: OrgId.make("org_testorg01"), projectId: null, resourceIds: [], name: "todo", nameFollowsRule: true, modeFollowsRule: true, applies: null,
  rule: "nobody can update todo list in notion", mode: "enforce", approvers: [], threshold: 0.5, status: "draft", compiled: null,
  compiledVersion: 0, testCalls: [], pins: [], verify: null, createdBy: UserId.make("usr_testuser01"), createdAt: at(0), updatedAt: null, ...extra
})
const now = t0 + 30_000

describe("a rule's row in the list", () => {
  it("shows the live stage while verify works", () => {
    expect(rowState(guard({ verify: run(["queued", "finding_targets", "drafting"]) }), now).kind).toBe("verifying")
  })

  it("marks what needs a person: a pin to confirm, a failed or stuck run, a suggestion to review", () => {
    expect(rowState(guard({ verify: run(["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation"]) }), now)).toMatchObject({ kind: "attention", reason: "confirm" })
    expect(rowState(guard({ verify: run(["queued", "finding_targets", "failed"]) }), now)).toMatchObject({ kind: "attention", reason: "failed" })
    expect(rowState(guard({ verify: run(["queued", "drafting"]) }), now + 11 * 60_000)).toMatchObject({ kind: "attention", reason: "stale" })
    const unresolved = { ...compiled, suggestion: { mode: "require_approval" as const, approvers: [], unresolved: ["Jo"], cue: "without Jo's ok" } }
    expect(rowState(guard({ compiled: unresolved, mode: "require_approval", verify: run(["queued", "done"]) }), now)).toMatchObject({ kind: "attention", reason: "suggestion" })
    expect(rowState(guard({ compiled, mode: "monitor", modeFollowsRule: false, verify: run(["queued", "done"]) }), now)).toMatchObject({ kind: "attention", reason: "suggestion" })
  })

  it("offers Review & activate for a verified draft, and never for an active rule", () => {
    expect(rowState(guard({ compiled, verify: run(["queued", "done"]) }), now).kind).toBe("review")
    expect(rowState(guard({ compiled, status: "active", verify: run(["queued", "done"]) }), now).kind).toBe("status")
    expect(rowState(guard(), now).kind).toBe("status")
  })
})
