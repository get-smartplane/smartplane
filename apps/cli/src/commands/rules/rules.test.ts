import { describe, expect, it } from "vitest"
import type { RecordedRequest } from "../../testing/fake-api"
import { runCli } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const id = "grd_todolist01"
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 24, 12, 0, seconds)).toISOString()

/** A guard on the wire, its verify run having reached `stages` (the last one is where it is). */
const guardAt = (stages: ReadonlyArray<string>, error?: string) => ({
  id, orgId: "org_testorg01", projectId: null, resourceIds: [], name: "todo list", nameFollowsRule: true, modeFollowsRule: false, applies: null,
  rule: "nobody can update todo list in notion", mode: "enforce", approvers: [], threshold: 0.5, status: "draft",
  compiled: stages.includes("drafting") && stages.length > 3 ? { instructions: "Does this call change the Notion to-do list?", examples: [] } : null,
  compiledVersion: stages.length > 3 ? 1 : 0, testCalls: [], pins: [],
  verify: {
    runId: "vr_0123456789abcdef0123", stage: stages.at(-1), startedAt: at(0), updatedAt: at(stages.length * 5),
    timeline: stages.map((stage, index) => ({ stage, at: at(index * 5) })), ...(error === undefined ? {} : { error })
  },
  createdBy: "usr_testuser01", createdAt: at(0), updatedAt: null
})

/** Each poll of the guard answers the next state; the last one repeats. */
const polls = (states: ReadonlyArray<ReturnType<typeof guardAt>>) => {
  let index = 0
  return (_request: RecordedRequest) => ({ body: states[Math.min(index++, states.length - 1)] })
}

describe("rules verify", () => {
  it("--no-wait starts the run and returns at once with it", async () => {
    const run = await runCli(["rules", "verify", id, "--no-wait"], { env, routes: { [`POST /api/guards/${id}/compile`]: { status: 202, body: guardAt(["queued"]) } } })
    expect(run.exitCode).toBe(0)
    expect(run.requests.map((request) => `${request.method} ${request.path}`)).toEqual([`POST /api/guards/${id}/compile`])
    expect(run.stdout).toContain("Starting · vr_0123456789abcdef0123")
    expect(run.stderr).toBe("")
  })

  it("waits with one line per stage, then the outcome", async () => {
    const run = await runCli(["rules", "verify", id], {
      env,
      routes: {
        [`POST /api/guards/${id}/compile`]: { status: 202, body: guardAt(["queued"]) },
        [`GET /api/guards/${id}`]: polls([
          guardAt(["queued", "finding_targets", "drafting"]),
          guardAt(["queued", "finding_targets", "drafting", "reviewing", "testing", "retrying", "done"])
        ])
      }
    })
    expect(run.exitCode).toBe(0)
    expect(run.stderr.split("\n")).toEqual([
      "… Finding the tools it applies to",
      "… Writing the check",
      "… Reviewing",
      "… Testing on example calls",
      "… Improving",
      `✓ Done in 35 s. Review it with \`smartplane rules get ${id}\`, then \`smartplane rules activate ${id}\`.`
    ])
    expect(run.stdout).toContain("Does this call change the Notion to-do list?")
  }, 15_000)

  it("reports a failed run with its reason", async () => {
    const run = await runCli(["rules", "verify", id], {
      env,
      routes: {
        [`POST /api/guards/${id}/compile`]: { status: 202, body: guardAt(["queued"]) },
        [`GET /api/guards/${id}`]: { body: guardAt(["queued", "finding_targets", "drafting", "failed"], "Verify could not finish (the model was too slow). Verify again.") }
      }
    })
    expect(run.stderr).toContain("✗ Failed after 20 s: Verify could not finish (the model was too slow). Verify again.")
  }, 15_000)

  it("stops waiting when the run needs a person to confirm what the rule names", async () => {
    const paused = { ...guardAt(["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation"]) }
    const withCandidates = { ...paused, compiled: { instructions: "Q", examples: [], pinning: { status: "found", mention: "todo list", candidates: [{ resourceId: "res_notion0001", entityId: "8c1d2e3f", label: "Todo", kind: "database" }] } } }
    const run = await runCli(["rules", "verify", id], {
      env,
      routes: { [`POST /api/guards/${id}/compile`]: { status: 202, body: guardAt(["queued"]) }, [`GET /api/guards/${id}`]: { body: withCandidates } }
    })
    expect(run.exitCode).toBe(0)
    expect(run.stderr).toContain("? The rule names “todo list”. Which one is it?")
    expect(run.stderr).toContain("Todo (database) 8c1d2e3f")
    expect(run.stderr).toContain(`smartplane rules verify ${id} --continue`)
    expect(run.requests.filter((request) => request.method === "GET")).toHaveLength(1)
  }, 15_000)

  it("--continue resumes a run waiting for a confirmation", async () => {
    const run = await runCli(["rules", "verify", id, "--continue", "--no-wait"], {
      env,
      routes: { [`POST /api/guards/${id}/verify/continue`]: { body: guardAt(["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation", "testing"]) } }
    })
    expect(run.exitCode).toBe(0)
    expect(run.requests.map((request) => request.path)).toEqual([`/api/guards/${id}/verify/continue`])
  })
})
