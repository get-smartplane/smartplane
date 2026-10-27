import { assert, describe, it } from "@effect/vitest"
import { type ConnectionContext, type Guard, type GuardApplies, GuardId, type GuardReferences, type Principal, type Resource, TeamId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { Approvals } from "../access/approvals"
import { Classifier } from "../guards/classifier"
import { GuardEvaluator } from "../guards/evaluator"
import { GuardsRepo } from "../guards/guards-repo"
import { fakeTeams } from "../testing/connection-fakes"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { memoryPinChildren, type Recorded, recordingAudit, resourceOf } from "../testing/gateway-fakes"
import { ToolPipeline } from "./pipeline"
import type { GatewayTool } from "./provider"
import { textResult } from "./sdk"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const github = resourceOf("res_github0001", "GitHub", { kind: "mcp_server", url: "https://api.githubcopilot.com/mcp", transport: "streamable_http" })
const contractors = TeamId.make("team_contract1")
const noPeople: GuardReferences = { people: false, accounts: [] }

/** `legacy`: verified before references were read. */
const guard = (id: string, applies: GuardApplies | null, references: GuardReferences | "legacy" = noPeople): Guard => ({
  id: GuardId.make(`grd_${id}`), orgId, projectId: null, resourceIds: [], name: id, nameFollowsRule: false, modeFollowsRule: false, approvers: [],
  rule: id, mode: "enforce", threshold: 0.5, status: "active", applies,
  compiled: { instructions: `Does this call break ${id}?`, examples: [], ...(references === "legacy" ? {} : { references }) },
  compiledVersion: 1, testCalls: [], pins: [], verify: null, createdBy: userId, createdAt: now, updatedAt: null
})

const todo = guard("todolist01", { resourceIds: [notion.id], operations: "changes", tools: [{ resourceId: notion.id, only: ["notion-update-page"], known: ["notion-update-page", "notion-fetch", "notion-delete-pages"] }] })
const push = guard("ctrpush001", { resourceIds: [github.id], actors: { kind: "only", refs: [{ _tag: "Team", teamId: contractors }] } })
const writes = guard("allwrites1", { resourceIds: [], operations: "changes" })

const toolOf = (target: Resource, name: string, readOnly: boolean | undefined, connection: ConnectionContext | null = null): GatewayTool => ({
  definition: { name: `${target.name.toLowerCase()}__${name}`, description: name, inputSchema: { type: "object" }, ...(readOnly === undefined ? {} : { annotations: { readOnlyHint: readOnly } }) },
  target,
  operation: name,
  prepare: (args) => Effect.succeed({ arguments: args, connection, execute: Effect.succeed(textResult("ok")) })
})

const world = (active: ReadonlyArray<Guard>) => {
  const asked: Array<{ readonly state: unknown; readonly questions: ReadonlyArray<string> }> = []
  const events: Array<Recorded> = []
  const repo = { list: () => Effect.succeed(active), active: () => Effect.succeed(active), find: () => Effect.succeed(Option.none()), insert: () => Effect.void, save: () => Effect.void, setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false) }
  const layer = ToolPipeline.layer.pipe(
    Layer.provide(GuardEvaluator.layer),
    Layer.provide(Layer.mergeAll(
      memoryPinChildren(),
      fakeTeams([{ id: contractors, orgId, name: "Contractors", slug: "contractors", directoryGroupId: null, memberCount: 1, createdAt: now }]),
      recordingAudit(events),
      Layer.succeed(GuardsRepo, repo),
      Layer.succeed(Classifier, { classify: (state, questions) => Effect.sync(() => (asked.push({ state, questions: [...questions.keys()] }), new Map([...questions.keys()].map((key) => [key, 0.1])))) }),
      Layer.succeed(Approvals, { listPending: () => Effect.die("unused"), decide: () => Effect.die("unused"), request: () => Effect.die("unused") })
    ))
  )
  const run = (principal: Principal, tool: GatewayTool) => ToolPipeline.use((pipeline) => pipeline.run(principal, tool, { page_id: "1f2e" }))
  return { asked, events, layer, run }
}

const contractor = userPrincipal({ teamIds: [contractors] })

describe("guards' call filters in the pipeline", () => {
  it.effect("no Clef call at all when no guard's filter covers the call, and the audit says so", () => {
    const { asked, events, layer, run } = world([todo, push])
    return Effect.gen(function*() {
      yield* run(userPrincipal(), toolOf(notion, "notion-fetch", true))
      yield* run(userPrincipal(), toolOf(github, "push_files", false))
      assert.strictEqual(asked.length, 0)
      const outcomes = events.filter((event) => event.type === "mcp.tool_called")
      assert.deepStrictEqual(outcomes.map((event) => event.data["guards"]), [
        { evaluated: 0, skipped: 2, skippedIds: [todo.id, push.id] },
        { evaluated: 0, skipped: 2, skippedIds: [todo.id, push.id] }
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect("exactly the covering guards, in one Clef call", () => {
    const { asked, events, layer, run } = world([todo, push, writes])
    return Effect.gen(function*() {
      yield* run(contractor, toolOf(github, "push_files", false))
      yield* run(userPrincipal(), toolOf(notion, "notion-update-page", false))
      // A tool the server added after verify: matched by resource and operation class.
      yield* run(userPrincipal(), toolOf(notion, "notion-bulk-archive", undefined))
      assert.deepStrictEqual(asked.map((call) => call.questions), [[push.id, writes.id], [todo.id, writes.id], [todo.id, writes.id]])
      assert.deepStrictEqual(events[0]?.data["guards"], { evaluated: 2, skipped: 1, skippedIds: [todo.id] })
      assert.deepStrictEqual(Object.keys(events[0]?.data["scores"] ?? {}), [push.id, writes.id])
    }).pipe(Effect.provide(layer))
  })

  it.effect("a guard without an accepted filter keeps today's behaviour: every call in its scope", () => {
    const { asked, layer, run } = world([guard("unfiltrd01", null)])
    return Effect.gen(function*() {
      yield* run(userPrincipal(), toolOf(notion, "notion-fetch", true))
      assert.strictEqual(asked.length, 1)
    }).pipe(Effect.provide(layer))
  })

  it.effect("the audit counts instead of listing when many guards are skipped", () => {
    const many = Array.from({ length: 12 }, (_, n) => guard(`skipped${String(n).padStart(3, "0")}`, { resourceIds: [github.id] }))
    const { events, layer, run } = world(many)
    return Effect.gen(function*() {
      yield* run(userPrincipal(), toolOf(notion, "notion-update-page", false))
      assert.deepStrictEqual(events[0]?.data["guards"], { evaluated: 0, skipped: 12 })
    }).pipe(Effect.provide(layer))
  })
})

const billing: ConnectionContext = { mode: "shared", accountIdentity: { email: "billing@acme.com", subject: "1234" }, connectedBy: { userId, email: "ian@acme.com" } }
const personal: ConnectionContext = { mode: "per_user", accountIdentity: { email: "ada.private@gmail.com" }, connectedBy: { userId, email: "ada@example.com" } }

describe("personal data in the call-time classifier's input", () => {
  const scan = (asked: ReadonlyArray<{ readonly state: unknown }>) => JSON.stringify(asked.map((call) => call.state)).toLowerCase()
  const gmail = resourceOf("res_gmail00001", "Gmail", { kind: "mcp_server", url: "https://gmail.example.com/mcp", transport: "streamable_http" })

  it.effect("no email, account identity or connector when no guard names people or that account", () => {
    const { asked, layer, run } = world([guard("sendmail01", { resourceIds: [] })])
    return Effect.gen(function*() {
      yield* run(contractor, toolOf(gmail, "send_email", false, billing))
      yield* run(contractor, toolOf(gmail, "send_email", false, personal))
      const seen = scan(asked)
      for (const value of ["ada@example.com", "billing@acme.com", "ada.private@gmail.com", "ian@acme.com", "1234"]) assert.notInclude(seen, value)
      // Role, team names and the account's mode still reach it: rules name those.
      assert.include(seen, "\"teamnames\":[\"contractors\"]")
      assert.include(seen, "\"mode\":\"shared\"")
    }).pipe(Effect.provide(layer))
  })

  it.effect("the caller's email when a guard names people; the account only when a guard names that account", () => {
    const people = guard("danasays01", { resourceIds: [] }, { people: true, accounts: [] })
    const account = guard("billing001", { resourceIds: [] }, { people: false, accounts: ["billing@"] })
    const { asked, layer, run } = world([people, account])
    return Effect.gen(function*() {
      yield* run(userPrincipal(), toolOf(gmail, "send_email", false, billing))
      yield* run(userPrincipal(), toolOf(gmail, "send_email", false, personal))
      const [first, second] = asked.map((call) => JSON.stringify(call.state))
      assert.include(first, "ada@example.com")
      assert.include(first, "billing@acme.com")
      assert.notInclude(second, "ada.private@gmail.com")
    }).pipe(Effect.provide(layer))
  })

  it.effect("rules verified before references existed still see every identity", () => {
    const { asked, layer, run } = world([guard("legacy0001", null, "legacy")])
    return Effect.gen(function*() {
      yield* run(userPrincipal(), toolOf(gmail, "send_email", false, billing))
      const seen = scan(asked)
      assert.include(seen, "ada@example.com")
      assert.include(seen, "billing@acme.com")
    }).pipe(Effect.provide(layer))
  })
})
