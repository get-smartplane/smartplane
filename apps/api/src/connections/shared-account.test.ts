import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type Guard, GuardId, type Principal, type Resource, ResourceId, TeamId, UserId } from "@pc/domain"
import { DateTime, Effect, Layer, Option, Predicate } from "effect"
import { Approvals } from "../access/approvals"
import { makeUpstreamMcpProvider } from "../gateway-tools/upstream-mcp"
import { Classifier } from "../guards/classifier"
import { GuardEvaluator } from "../guards/evaluator"
import { GuardsRepo } from "../guards/guards-repo"
import { ToolCatalog } from "../mcp/catalog"
import { ToolSearchSettings } from "../mcp/search/mode"
import { McpGateway } from "../mcp/gateway"
import { ToolPipeline } from "../mcp/pipeline"
import { ToolProviders } from "../mcp/provider"
import { textResult } from "../mcp/sdk"
import { Upstream } from "../mcp/upstream"
import { UpstreamClient } from "../mcp/upstream-client"
import { TeamsRepo } from "../org/teams-repo"
import { connectionServices, grantRow, resourceRow } from "../testing/connection-harness"
import { fakeOAuthServer, mcpUrl } from "../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { memoryPinChildren } from "../testing/gateway-fakes"
import { insertRow, seedOrg, seedUser } from "../testing/seed"
import { Connections } from "./connections"
import { ConnectionCallback } from "./oauth/callback"

const gmail: Resource = {
  id: ResourceId.make("res_gmailmcp01"),
  orgId,
  projectId: null,
  name: "Gmail",
  description: "The shared billing@ mailbox",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth" } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}
const personal: Resource = { ...gmail, id: ResourceId.make("res_figmauser1"), name: "Figma", config: { ...gmail.config, kind: "mcp_server", url: mcpUrl, transport: "streamable_http", accountMode: "per_user", auth: { type: "oauth" } } }

const finance = TeamId.make("team_finance01")
const sales = TeamId.make("team_sales0001")
const malloryId = "usr_mallory001"
/** Ada administers and is in finance; Eve is in sales with a grant; Mallory has no grant at all. */
const ada = userPrincipal({ permissions: ["resources:read", "resources:manage"], teamIds: [finance] })
const eve = userPrincipal({ userId: otherUserId, email: "eve@example.com", teamIds: [sales] })
const mallory = userPrincipal({ userId: UserId.make(malloryId), email: "mallory@example.com" })

const guard: Guard = {
  id: GuardId.make("grd_billing001"),
  orgId,
  projectId: null,
  resourceIds: [],
  name: "Only finance sends from billing@",
  nameFollowsRule: false,
  modeFollowsRule: false,
  applies: null,
  approvers: [],
  rule: "nobody except finance sends email from the shared billing@ Gmail",
  mode: "enforce",
  threshold: 0.5,
  status: "active",
  compiled: { instructions: "Does someone outside finance send email from billing@acme.com?", examples: [] },
  compiledVersion: 1,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

const get = (value: unknown, ...path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (Predicate.isObject(current) ? current[key] : undefined), value)

/** Stands in for Clef: answers from the action's state exactly as the compiled rule asks. */
const accountAwareClassifier = (states: Array<unknown>) =>
  Layer.succeed(Classifier, {
    classify: (state, questions) =>
      Effect.sync(() => {
        states.push(state)
        const sends = get(state, "tool") === "send_email"
        const fromBilling = get(state, "connection", "accountIdentity", "email") === "billing@acme.com"
        const teams = get(state, "actor", "teamNames")
        const inFinance = Array.isArray(teams) && teams.includes("Finance")
        return new Map(Array.from(questions.keys(), (id) => [id, sends && fromBilling && !inFinance ? 0.97 : 0.02]))
      })
  })

const upstreamCalls: Array<{ tool: string; authorization: string | undefined }> = []
const fakeUpstream = Layer.succeed(UpstreamClient, {
  listTools: () => Effect.succeed([{ name: "send_email", inputSchema: { type: "object" } }, { name: "read_inbox", inputSchema: { type: "object" } }]),
  callTool: (target, tool) => Effect.sync(() => (upstreamCalls.push({ tool, authorization: target.headers.authorization }), textResult("sent")))
})

const gateway = (events: Array<AuditEvent>, states: Array<unknown>) => {
  const fake = fakeOAuthServer({ email: "billing@acme.com" })
  const guards = Layer.mergeAll(
    Layer.succeed(GuardsRepo, { list: () => Effect.succeed([guard]), active: () => Effect.succeed([guard]), find: () => Effect.succeed(Option.none()), insert: () => Effect.void, save: () => Effect.void, setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false) }),
    accountAwareClassifier(states),
    Layer.succeed(Approvals, { listPending: () => Effect.succeed([]), decide: () => Effect.die("unused"), request: () => Effect.die("no approval guard here") }),
    TeamsRepo.layer
  )
  return McpGateway.layer.pipe(
    Layer.provide(Layer.mergeAll(ToolCatalog.layer, ToolPipeline.layer.pipe(Layer.provide(memoryPinChildren())), ToolSearchSettings.fixed(null))),
    Layer.provide(Layer.mergeAll(Layer.effect(ToolProviders, Effect.map(makeUpstreamMcpProvider, (provider) => [provider])), GuardEvaluator.layer.pipe(Layer.provide(guards), Layer.provide(memoryPinChildren())))),
    Layer.provide(Upstream.layer.pipe(Layer.provide(fakeUpstream))),
    Layer.provideMerge(connectionServices(fake.fetch, events))
  )
}

const seed = Effect.gen(function*() {
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
  yield* seedUser(malloryId, "mallory@example.com", "mem_mallory01")
  yield* insertRow("teams", { id: finance, orgId, name: "Finance", slug: "finance", createdAt: DateTime.formatIso(now) })
  yield* insertRow("teams", { id: sales, orgId, name: "Sales", slug: "sales", createdAt: DateTime.formatIso(now) })
  yield* resourceRow(gmail)
  yield* resourceRow(personal)
  yield* grantRow("grt_adause0001", gmail.id, userId)
  yield* grantRow("grt_eveuse0001", gmail.id, otherUserId)
  yield* grantRow("grt_evefigma01", personal.id, otherUserId)
  // Ada connects the shared billing@ account once.
  const started = yield* Connections.use((connections) => connections.startOAuth(ada, gmail.id))
  const state = new URL(started.authorizeUrl).searchParams.get("state") ?? ""
  yield* ConnectionCallback.use((callback) => callback.complete({ state, code: "code-1" }, Option.some(ada)))
})

const call = (principal: Principal, name: string) => McpGateway.use((gateway) => gateway.callTool(principal, name, { to: "customer@example.com" }))
const credentialReads = (events: ReadonlyArray<AuditEvent>) => events.filter((event) => event.type === "secret.accessed")

describe("one shared account, per-person permissions and guards", () => {
  it.effect("checks grants before the shared credential is ever decrypted, then lets guards decide on the account's identity", () => {
    const events: Array<AuditEvent> = []
    const states: Array<unknown> = []
    upstreamCalls.length = 0
    return Effect.gen(function*() {
      yield* seed
      events.length = 0

      // Mallory has no grant: the tool does not exist for her, and nothing is decrypted.
      assert.isFalse((yield* McpGateway.use((g) => g.listTools(mallory))).some((tool) => tool.name.startsWith("gmail__")))
      const unknown = yield* call(mallory, "gmail__send_email")
      assert.isTrue(unknown.isError)
      assert.include(JSON.stringify(unknown.content), "not available to you")
      assert.deepStrictEqual(credentialReads(events), [])
      assert.deepStrictEqual(upstreamCalls, [])

      // Eve is granted, but the guard sees she would send from billing@ outside finance: denied, never decrypted.
      yield* McpGateway.use((g) => g.listTools(ada))
      events.length = 0
      const refused = yield* call(eve, "gmail__send_email")
      assert.include(JSON.stringify(refused.content), "Denied by a guard rule: GuardViolation")
      assert.deepStrictEqual(credentialReads(events), [])
      assert.deepStrictEqual(upstreamCalls, [])
      assert.deepInclude(get(states.at(-1), "connection"), { mode: "shared", accountIdentity: { email: "billing@acme.com", subject: "acct-42" } })
      assert.deepInclude(get(states.at(-1), "actor"), { email: "eve@example.com", teamNames: ["Sales"] })
      assert.deepInclude(get(states.at(-1), "resource"), { accountMode: "shared" })
      const denied = events.find((event) => event.type === "policy.denied")
      assert.deepStrictEqual(denied?.actor, { type: "user", id: otherUserId })
      assert.deepStrictEqual(get(denied?.data, "connection"), { mode: "shared", accountIdentity: { email: "billing@acme.com", subject: "acct-42" }, connectedBy: { userId, email: "ada@example.com" } })

      // Ada is in finance: allowed, and the call goes out with the shared account's token.
      const sent = yield* call(ada, "gmail__send_email")
      assert.isFalse(sent.isError)
      assert.deepStrictEqual(upstreamCalls, [{ tool: "send_email", authorization: "Bearer at-1" }])
      const called = events.find((event) => event.type === "mcp.tool_called")
      assert.deepStrictEqual(called?.actor, { type: "user", id: userId })
      assert.deepStrictEqual(get(called?.data, "connection"), { mode: "shared", accountIdentity: { email: "billing@acme.com", subject: "acct-42" }, connectedBy: { userId, email: "ada@example.com" } })
      assert.notInclude(JSON.stringify(events), "at-1")
    }).pipe(Effect.provide(gateway(events, states)))
  })

  it.effect("a per-user server without the caller's own account answers with a typed 'connect your account' error", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const tools = yield* McpGateway.use((g) => g.listTools(eve))
      assert.include(tools.map((tool) => tool.name), "figma__connect_account")
      const result = yield* call(eve, "figma__connect_account")
      assert.isTrue(result.isError)
      assert.deepStrictEqual(result.structuredContent, {
        error: { type: "AccountNotConnected", resourceId: personal.id, connectUrl: `https://app.example.com/connections?resource=${personal.id}`, shared: false }
      })
      assert.include(JSON.stringify(result.content), "uses your own account")
      const denied = events.find((event) => event.type === "policy.denied" && event.target?.id === personal.id)
      assert.deepStrictEqual(get(denied?.data, "reasons"), [{ _tag: "NotConnected", resourceId: personal.id }])

      // Eve connects her own account; nobody else's connection (not even Ada's) can stand in for it.
      const started = yield* Connections.use((connections) => connections.startOAuth(eve, personal.id))
      const state = new URL(started.authorizeUrl).searchParams.get("state") ?? ""
      assert.include(yield* ConnectionCallback.use((callback) => callback.complete({ state, code: "c" }, Option.some(eve))), "/connections?resource=")
      const mine = yield* Connections.use((connections) => connections.mine(eve))
      assert.deepStrictEqual(mine.map((entry) => [entry.resource.id, entry.connection?.userId]), [[personal.id, otherUserId]])
      const adas = yield* Connections.use((connections) => connections.forResource(ada, personal.id))
      assert.isNull(adas.mine)
    }).pipe(Effect.provide(gateway(events, [])))
  })
})
