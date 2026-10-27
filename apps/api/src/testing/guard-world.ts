import { type Guard, GuardId, type GuardPinCandidate, type GuardPinLookup, ResourceId, RoleSlug, UpstreamFailure } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { TokensRepo } from "../access/tokens-repo"
import { Principals } from "../auth/principals"
import { UsersRepo } from "../auth/users-repo"
import { Classifier } from "../guards/classifier"
import { GuardCompiler } from "../guards/compiler"
import { ExampleCalls } from "../guards/examples/example-calls"
import { GuardToolDocs } from "../guards/grounding/tool-docs"
import { Guards } from "../guards/guards"
import { GuardsRepo } from "../guards/guards-repo"
import { GuardStarters } from "../guards/starters/starters"
import { PinLookup } from "../guards/pinning/lookup"
import { GuardPins } from "../guards/pinning/pins"
import { GuardTestCalls } from "../guards/test-calls"
import { GuardVerifier } from "../guards/verify"
import { VerifyPrincipals } from "../guards/verify-job/requester"
import { VerifyRunner } from "../guards/verify-job/runner"
import { VerifyRuns } from "../guards/verify-job/runs"
import { IntegrationCatalog } from "../integrations/catalog"
import { Upstream } from "../mcp/upstream"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { ProjectsRepo } from "../org/projects-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { AppConfig } from "../platform/config"
import { ResourcesRepo } from "../resources/resources-repo"
import { testConfig } from "./config"
import { TestDatabase } from "./database"
import { now, orgId, userId, userPrincipal } from "./fixtures"
import { memoryKv, memoryPinChildren, type Recorded, recordingAudit } from "./gateway-fakes"
import { type AiScript, fakeAi, fakeClassifier } from "./guard-models"
import { insertRow, seedOrg, seedUser } from "./seed"
import { verifyQueue } from "./verify-queue"
import { databaseVisibility } from "./visibility"

export { rule } from "./guard-models"
export type { AiScript } from "./guard-models"

const notConnected = Layer.succeed(Upstream, {
  listTools: () => Effect.fail(new UpstreamFailure({ upstream: "Notion", message: "the account is not connected" })),
  callTool: () => Effect.die("never called while verifying")
})

export const guard: Guard = {
  id: GuardId.make("grd_todolist01"),
  orgId,
  projectId: null,
  resourceIds: [],
  name: "nobody can update todo list in notion",
  nameFollowsRule: true,
  modeFollowsRule: false,
  applies: null,
  rule: "nobody can update todo list in notion",
  mode: "enforce",
  approvers: [],
  threshold: 0.5,
  status: "draft",
  compiled: null,
  compiledVersion: 0,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

/** Members whose names and emails must never reach a model (see the PII test). */
export const seededMembers = [
  { id: "usr_danascul1", email: "dana.scully@acme-fbi.test", name: "Dana Scully", membership: "mem_danascul1" },
  { id: "usr_foxmuldr1", email: "fox.mulder@acme-fbi.test", name: "Fox Mulder", membership: "mem_foxmuldr1" }
] as const

const seed = Effect.gen(function*() {
  yield* seedOrg
  // The verifying admin: each stage re-resolves them from the database and needs `guards:manage`.
  yield* SqlClient.SqlClient.use((sql) => sql`UPDATE memberships SET role = 'admin' WHERE id = 'mem_testmem01'`).pipe(Effect.orDie)
  for (const member of seededMembers) {
    yield* seedUser(member.id, member.email, member.membership)
    yield* SqlClient.SqlClient.use((sql) => sql`UPDATE users SET name = ${member.name} WHERE id = ${member.id}`).pipe(Effect.orDie)
  }
  yield* insertRow("resources", {
    id: "res_notion0001",
    orgId,
    kind: "mcp_server",
    name: "Notion",
    description: "Company workspace",
    config: JSON.stringify({ kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http", accountMode: "per_user" }),
    createdBy: userId,
    createdAt: DateTime.formatIso(now)
  })
})

export const todoCandidate: GuardPinCandidate = {
  resourceId: ResourceId.make("res_notion0001"),
  entityId: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
  label: "Todo",
  kind: "database",
  url: "https://www.notion.so/acme/Todo-8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f"
}
export const foundTodo: GuardPinLookup = { status: "found", mention: "todo list", resourceId: todoCandidate.resourceId, tool: "notion__notion-search", candidates: [todoCandidate] }

/**
 * The real `Guards`, verify runs and their runner, pins and test calls over a test database, with fake models
 * (`drafts`, every model input in `inputs`), a fake classifier (`states`), an in-memory queue and KV for the
 * job (`queue`, drained with `drainVerifyQueue`) and a pin lookup that answers `lookup`.
 */
export const guardWorld = (options: { readonly script?: AiScript; readonly lookup?: GuardPinLookup } = {}) => {
  const drafts: Array<string> = []
  const inputs: Array<unknown> = []
  const states: Array<unknown> = []
  const events: Array<Recorded> = []
  const children = new Map<string, ReadonlyArray<string>>()
  const { queue, layer: jobs } = verifyQueue()
  const lookup = Layer.succeed(PinLookup, { lookup: () => Effect.succeed(options.lookup), check: (_principal, pins) => Effect.succeed(pins) })
  const docs = GuardToolDocs.layer.pipe(Layer.provide(Layer.mergeAll(IntegrationCatalog.layer, notConnected)))
  const models = Layer.mergeAll(Layer.effect(GuardCompiler, GuardCompiler.make("@cf/test/llm")), Layer.effect(ExampleCalls, ExampleCalls.make("@cf/test/llm")))
  const repos = Layer.mergeAll(GuardsRepo.layer, ResourcesRepo.layer, ProjectsRepo.layer, TeamsRepo.layer, MembersRepo.layer, RolesRepo.layer, TokensRepo.layer, UsersRepo.layer, OrgsRepo.layer)
  const layer = Layer.merge(Guards.layer, GuardStarters.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(GuardTestCalls.layer, VerifyRunner.layer, GuardPins.layer)),
    Layer.provideMerge(Layer.mergeAll(VerifyRuns.layer, GuardVerifier.layer)),
    Layer.provideMerge(Layer.mergeAll(docs, models, jobs, lookup, memoryPinChildren(children), databaseVisibility, VerifyPrincipals.layer)),
    Layer.provideMerge(Principals.layer),
    Layer.provideMerge(Layer.mergeAll(fakeAi(drafts, inputs, options.script ?? {}), memoryKv(), fakeClassifier(states), recordingAudit(events), Layer.succeed(AppConfig, testConfig))),
    Layer.provideMerge(Layer.provideMerge(Layer.effectDiscard(seed), repos.pipe(Layer.provideMerge(TestDatabase))))
  )
  return { drafts, inputs, states, events, queue, children, layer }
}

export const admin = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["resources:read", "guards:manage"] })
