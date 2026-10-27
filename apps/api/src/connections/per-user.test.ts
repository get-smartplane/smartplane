import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type Resource, ResourceId } from "@pc/domain"
import { DateTime, Effect, Redacted } from "effect"
import { actorOf } from "../audit/actor"
import { connectionServices, grantRow, resourceRow } from "../testing/connection-harness"
import { fakeOAuthServer } from "../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg, seedUser, selectRows } from "../testing/seed"
import { Connections } from "./connections"
import { ConnectionResolver } from "./resolver"

const secretId = ResourceId.make("res_crmshared1")
const resource = (id: string, config: Resource["config"]): Resource => ({
  id: ResourceId.make(id),
  orgId,
  projectId: null,
  name: id,
  description: "",
  config,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
})
const crm = resource("res_crmapi0001", { kind: "api", baseUrl: "https://crm.example.com", accountMode: "per_user" })
const sharedApi = resource("res_crmshared2", { kind: "api", baseUrl: "https://crm.example.com", authSecretId: secretId })
const tokens = resource("res_mcptoken01", { kind: "mcp_server", url: "https://mcp.example.com/mcp", transport: "streamable_http", auth: { type: "secret", secretId } })

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const eve = userPrincipal({ userId: otherUserId, email: "eve@example.com" })

const seed = Effect.gen(function*() {
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
  yield* resourceRow({ ...crm, id: secretId, name: "shared key", config: { kind: "secret" } })
  for (const each of [crm, sharedApi, tokens]) yield* resourceRow(each)
  yield* grantRow("grt_evecrm0001", crm.id, otherUserId)
  yield* grantRow("grt_eveshared1", sharedApi.id, otherUserId)
})

describe("per-user credentials", () => {
  it.effect("each member connects their own key, which only their own calls can open", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const connect = (as: typeof eve, target: Resource, value: string) =>
        Connections.use((connections) => connections.connectSecret(as, target.id, { value: Redacted.make(value) }))
      // No grant, no personal key; a shared resource takes none at all.
      assert.strictEqual((yield* Effect.flip(connect(admin, crm, "sk-admin")))._tag, "Forbidden")
      assert.strictEqual((yield* Effect.flip(connect(eve, sharedApi, "sk-eve")))._tag, "InvalidInput")
      const connection = yield* connect(eve, crm, "sk-eve-own")
      assert.deepInclude(connection, { mode: "per_user", method: "secret", userId: otherUserId })

      const own = yield* ConnectionResolver.use((resolver) => resolver.credential(crm, eve, actorOf(eve)))
      assert.deepStrictEqual(own, { type: "secret", value: "sk-eve-own" })
      // An admin with every permission still has no account of their own here, and cannot reach Eve's.
      const adminCall = yield* Effect.flip(ConnectionResolver.use((resolver) => resolver.credential(crm, admin, actorOf(admin))))
      assert.deepInclude(adminCall, { _tag: "AccountNotConnected", shared: false, connectUrl: `https://app.example.com/connections?resource=${crm.id}` })
      const stored = yield* selectRows("SELECT ciphertext FROM connections WHERE user_id = ?", otherUserId)
      assert.notInclude(JSON.stringify(stored), "sk-eve-own")
      assert.notInclude(JSON.stringify(events), "sk-eve-own")
    }).pipe(Effect.provide(connectionServices(fakeOAuthServer().fetch, events)))
  })

  it.effect("switching modes drops the old mode's accounts and refuses a shared mode without its secret", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      yield* insertRow("connections", {
        id: "con_shared0001", orgId, resourceId: tokens.id, userId: null, mode: "shared", method: "secret", status: "connected",
        connectedBy: userId, connectedAt: DateTime.formatIso(now), ciphertext: "c", iv: "i", wrappedDek: "w", kekId: "k"
      })
      const forbidden = yield* Effect.flip(Connections.use((connections) => connections.setMode(eve, tokens.id, { mode: "per_user" })))
      assert.strictEqual(forbidden._tag, "Forbidden")
      const switched = yield* Connections.use((connections) => connections.setMode(admin, tokens.id, { mode: "per_user" }))
      assert.deepStrictEqual(switched.config.kind === "mcp_server" ? [switched.config.accountMode, switched.config.auth] : [], ["per_user", { type: "secret" }])
      assert.deepStrictEqual(yield* selectRows("SELECT id FROM connections WHERE resource_id = ?", tokens.id), [])
      assert.isTrue(events.some((event) => event.type === "connection.disconnected" && event.data.reason === "mode_changed"))
      const back = yield* Effect.flip(Connections.use((connections) => connections.setMode(admin, tokens.id, { mode: "shared" })))
      assert.deepInclude(back, { _tag: "InvalidInput", field: "mode" })
      // An API without a shared key may go back to shared (it then sends no credential).
      yield* Connections.use((connections) => connections.setMode(admin, crm.id, { mode: "shared" }))
    }).pipe(Effect.provide(connectionServices(fakeOAuthServer().fetch, events)))
  })
})
