import { assert, describe, it } from "@effect/vitest"
import { ProjectId, type ResourceId, RoleSlug, TeamId } from "@pc/domain"
import { DateTime, Effect } from "effect"
import { TestClock } from "effect/testing"
import { AccessPolicy } from "../access/access-policy"
import { Grants } from "../access/grants"
import { Lookup } from "../lookup/lookup"
import { now, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { resourceServices, storedResource, storeGrant, storeResource } from "../testing/resource-world"
import { insertRow, seedOrg, seedUser } from "../testing/seed"
import { Resources } from "./resources"

const team = TeamId.make("team_testteam1")
const projectA = ProjectId.make("prj_projecta01")
const projectB = ProjectId.make("prj_projectb01")
const secretAuth = (secretId: ResourceId) => ({ type: "secret" as const, secretId })

const key = storedResource("res_secretkey1", { kind: "secret" })
const server = storedResource("res_githubsrv1", { kind: "mcp_server", url: "https://gh.example.com/mcp", transport: "streamable_http", auth: secretAuth(key.id) })
const serverTool = storedResource("res_ghsearch01", { kind: "tool", serverId: server.id, toolName: "search" })
const api = storedResource("res_crmapi0001", { kind: "api", baseUrl: "https://crm.example.com" })
const note = storedResource("res_region0001", { kind: "variable", value: "eu-west-1" })
const scoped = storedResource("res_projvar001", { kind: "variable", value: "a" }, projectA)
const expired = storedResource("res_oldvar0001", { kind: "variable", value: "old" })
const hidden = storedResource("res_hidden0001", { kind: "variable", value: "no" })
const linear = storedResource("res_linearsrv1", { kind: "mcp_server", url: "https://linear.example.com/mcp", transport: "sse", auth: secretAuth(key.id) })
const linearTool = storedResource("res_lintool001", { kind: "tool", serverId: linear.id, toolName: "create_issue" })
const deliverable = storedResource("res_deliverkey", { kind: "secret", delivery: "deliverable", envName: "STRIPE_KEY" })
const readOnlyDeliverable = storedResource("res_deliverro1", { kind: "secret", delivery: "deliverable" })
const everything = [key, server, serverTool, api, note, scoped, expired, hidden, linear, linearTool, deliverable, readOnlyDeliverable]

const member = userPrincipal({ teamIds: [team] })
const admin = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["resources:read", "resources:manage"] })
const browser = userPrincipal({ role: RoleSlug.make("catalog"), permissions: ["resources:read", "resources:browse"] })
const granter = userPrincipal({ role: RoleSlug.make("granter"), permissions: ["resources:read", "grants:manage"] })
const auditor = userPrincipal({ role: RoleSlug.make("auditor"), permissions: ["resources:read", "audit:read"] })

const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
  for (const id of [projectA, projectB]) yield* insertRow("projects", { id, orgId: key.orgId, name: id, slug: id, createdAt: DateTime.formatIso(now) })
  for (const resource of everything) yield* storeResource(resource)
  yield* storeGrant("grt_viateam001", server.id, { type: "team", id: team })
  yield* storeGrant("grt_viarole001", api.id, { type: "role", role: RoleSlug.make("member") }, { action: "read" })
  yield* storeGrant("grt_viauser001", note.id, { type: "user", id: userId })
  yield* storeGrant("grt_project001", scoped.id, { type: "user", id: userId })
  yield* storeGrant("grt_expired001", expired.id, { type: "user", id: userId }, { expiresAt: DateTime.subtract(now, { hours: 1 }) })
  yield* storeGrant("grt_secret0001", key.id, { type: "user", id: userId })
  yield* storeGrant("grt_onetool001", linearTool.id, { type: "user", id: userId })
  yield* storeGrant("grt_evenote001", note.id, { type: "user", id: otherUserId })
  yield* storeGrant("grt_deliver001", deliverable.id, { type: "user", id: userId })
  yield* storeGrant("grt_deliverro1", readOnlyDeliverable.id, { type: "user", id: userId }, { action: "read" })
})

const ids = (resources: ReadonlyArray<{ readonly id: string }>) => resources.map((resource) => resource.id).sort()
const list = (principal: typeof member, filter = {}) => Resources.use((resources) => resources.list(principal, filter))
const getTag = (principal: typeof member, id: ResourceId) =>
  Resources.use((resources) => resources.get(principal, id)).pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "Found" }))

describe("resource visibility", () => {
  it.effect("members see only what they hold a live grant on, via team, role, user or project scope", () =>
    Effect.gen(function*() {
      yield* seed
      const seen = yield* list(member)
      assert.deepStrictEqual(ids(seen), ids([server, serverTool, api, note, scoped, linear, linearTool, deliverable]))
      // A server known only through one granted tool is shown without its connection details.
      const minimal = seen.find((resource) => resource.id === linear.id)
      assert.isTrue(minimal?.config.kind === "mcp_server" && minimal.config.auth === undefined)
      const full = seen.find((resource) => resource.id === server.id)
      assert.isTrue(full?.config.kind === "mcp_server" && full.config.auth !== undefined)
      // A token scoped to another project does not see project A's resource.
      assert.notInclude(ids(yield* list(userPrincipal({ teamIds: [team], projectId: projectB }))), scoped.id)
      assert.include(ids(yield* list(userPrincipal({ teamIds: [team], projectId: projectA }))), scoped.id)
    }).pipe(Effect.provide(resourceServices())))

  it.effect("members see a secret only when deliverable and granted use+, as metadata; others are NotFound", () =>
    Effect.gen(function*() {
      yield* seed
      const secrets = yield* list(member, { kind: "secret" })
      assert.deepStrictEqual(ids(secrets), [deliverable.id], "gateway-only and read-only secrets stay hidden")
      assert.deepStrictEqual(secrets[0]?.config, { kind: "secret", delivery: "deliverable", envName: "STRIPE_KEY" })
      assert.strictEqual(yield* getTag(member, deliverable.id), "Found")
      for (const id of [key.id, readOnlyDeliverable.id, hidden.id, expired.id]) assert.strictEqual(yield* getTag(member, id), "NotFound")
      assert.strictEqual(yield* getTag(member, note.id), "Found")
      assert.strictEqual(yield* getTag(member, linear.id), "Found")
    }).pipe(Effect.provide(resourceServices())))

  it.effect("leaves the gateway's grant resolution untouched: hiding is for listings only", () =>
    Effect.gen(function*() {
      yield* seed
      const access = yield* AccessPolicy.use((policy) => policy.resolve(member))
      // The gateway still resolves exactly the live grants, the secret's included; it never consults visibility.
      assert.deepStrictEqual(ids([...access.values()].map(({ resource }) => resource)), ids([server, api, note, scoped, key, linearTool, deliverable, readOnlyDeliverable]))
    }).pipe(Effect.provide(resourceServices())))

  it.effect("resources:manage sees everything; resources:browse everything but secrets it cannot receive", () =>
    Effect.gen(function*() {
      yield* seed
      // The catalogue hides secrets except deliverable ones this user (ada) holds a use grant on.
      const hiddenSecrets = new Set<string>([key.id, readOnlyDeliverable.id])
      assert.deepStrictEqual(ids(yield* list(admin)), ids(everything))
      assert.deepStrictEqual(ids(yield* list(browser)), ids(everything.filter((resource) => !hiddenSecrets.has(resource.id))))
      assert.strictEqual(yield* getTag(browser, key.id), "NotFound")
      assert.strictEqual(yield* getTag(browser, readOnlyDeliverable.id), "NotFound")
      assert.strictEqual(yield* getTag(browser, deliverable.id), "Found")
      assert.strictEqual(yield* getTag(browser, hidden.id), "Found")
      assert.deepStrictEqual(ids(yield* list(granter)), ids(everything.filter((resource) => !hiddenSecrets.has(resource.id))))
      const otherBrowser = userPrincipal({ userId: otherUserId, role: RoleSlug.make("catalog"), permissions: ["resources:read", "resources:browse"] })
      assert.strictEqual(yield* getTag(otherBrowser, deliverable.id), "NotFound", "without a grant, still hidden")
    }).pipe(Effect.provide(resourceServices())))

  it.effect("lookup resolves only visible resource names, except for audit readers", () =>
    Effect.gen(function*() {
      yield* seed
      const refs = [note, hidden, key].map((resource) => ({ kind: "resource" as const, id: resource.id }))
      const resolve = (principal: typeof member) =>
        Effect.map(Lookup.use((lookup) => lookup.resolve(principal, refs)), ({ entries }) => ids(entries))
      assert.deepStrictEqual(yield* resolve(member), [note.id])
      assert.deepStrictEqual(yield* resolve(browser), ids([note, hidden]))
      assert.deepStrictEqual(yield* resolve(auditor), ids([note, hidden, key]))
    }).pipe(Effect.provide(resourceServices())))

  it.effect("grant listings show members only their own grants on resources they can see", () =>
    Effect.gen(function*() {
      yield* seed
      const grants = (principal: typeof member) => Effect.map(Grants.use((service) => service.list(principal, {})), ids)
      assert.deepStrictEqual(yield* grants(member), ["grt_deliver001", "grt_onetool001", "grt_project001", "grt_viarole001", "grt_viateam001", "grt_viauser001"])
      assert.include(yield* grants(admin), "grt_evenote001")
      assert.include(yield* grants(admin), "grt_secret0001")
    }).pipe(Effect.provide(resourceServices())))
})
