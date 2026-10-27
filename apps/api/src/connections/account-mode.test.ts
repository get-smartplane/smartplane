import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, PieceId, type Resource, ResourceId } from "@pc/domain"
import { DateTime, Effect, Option, Redacted, Schema } from "effect"
import { upstreamToolsKey, upstreamUserToolsKey } from "../mcp/cache-keys"
import { KvCache } from "../platform/kv"
import { ResourcesRepo } from "../resources/resources-repo"
import { Secrets } from "../secrets/secrets"
import { connectionServices, grantRow, resourceRow } from "../testing/connection-harness"
import { fakeOAuthServer, mcpUrl } from "../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg, seedUser, selectRows } from "../testing/seed"
import { Connections } from "./connections"
import { ConnectionCallback } from "./oauth/callback"

const tokenSecretId = ResourceId.make("res_slacktok01")
const clientSecretId = ResourceId.make("res_slackapp01")
const base = { orgId, projectId: null, description: "", createdBy: userId, createdAt: now, updatedAt: null }
const slack: Resource = {
  ...base,
  id: ResourceId.make("res_slack00001"),
  name: "Slack",
  config: { kind: "integration", pieceId: PieceId.make("slack"), connection: { type: "oauth2", clientId: "123.456", clientSecretId, status: "connected", tokenSecretId } }
}
const figma: Resource = {
  ...base,
  id: ResourceId.make("res_figmauser1"),
  name: "Figma",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", accountMode: "per_user", auth: { type: "oauth" } }
}
const linear: Resource = {
  ...base,
  id: ResourceId.make("res_linearusr1"),
  name: "Linear",
  config: { kind: "mcp_server", url: "https://linear.example.com/mcp", transport: "streamable_http", accountMode: "per_user", auth: { type: "secret" } }
}

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const eve = userPrincipal({ userId: otherUserId, email: "eve@example.com" })
const Tools = Schema.Array(Schema.String)
const cached = (key: string) => Effect.map(KvCache.use((kv) => kv.get(key, Tools)), Option.isSome)
const prime = (key: string) => KvCache.use((kv) => kv.set(key, Tools, ["old_account_tool"], 300))

const seed = Effect.gen(function*() {
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
  yield* resourceRow({ ...slack, id: clientSecretId, name: "Slack app secret", config: { kind: "secret" } })
  yield* resourceRow({ ...slack, id: tokenSecretId, name: "Slack OAuth token", config: { kind: "secret" } })
  yield* Secrets.use((secrets) => secrets.store(tokenSecretId, Redacted.make("{\"accessToken\":\"xoxb-live\"}"), userId))
  yield* grantRow("grt_evetoken01", tokenSecretId, otherUserId)
  for (const each of [slack, figma, linear]) yield* resourceRow(each)
  yield* grantRow("grt_evefigma01", figma.id, otherUserId)
  yield* grantRow("grt_evelinear1", linear.id, otherUserId)
})

describe("account mode switches and per-user tool caches", () => {
  it.effect("going per-user disconnects a shared OAuth2 integration: token secret deleted, status cleared, audited", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      yield* insertRow("connections", {
        id: "con_slackshr01", orgId, resourceId: slack.id, userId: null, mode: "shared", method: "oauth", status: "connected",
        connectedBy: userId, connectedAt: DateTime.formatIso(now)
      })
      const switched = yield* Connections.use((connections) => connections.setMode(admin, slack.id, { mode: "per_user" }))
      const connection = switched.config.kind === "integration" ? switched.config.connection : undefined
      assert.deepStrictEqual(connection, { type: "oauth2", clientId: "123.456", clientSecretId, status: "not_connected" })

      // The stored resource agrees, the token secret is gone (with its grants), and so is the shared row.
      const stored = yield* ResourcesRepo.use((repo) => repo.find(orgId, slack.id))
      assert.deepStrictEqual(Option.map(stored, (found) => found.config), Option.some(switched.config))
      assert.isTrue(Option.isNone(yield* ResourcesRepo.use((repo) => repo.find(orgId, tokenSecretId))))
      assert.deepStrictEqual(yield* selectRows("SELECT id FROM grants WHERE resource_id = ? AND revoked_at IS NULL", tokenSecretId), [])
      assert.deepStrictEqual(yield* selectRows("SELECT id FROM connections WHERE resource_id = ?", slack.id), [])

      const disconnected = events.filter((event) => event.type === "connection.disconnected")
      assert.deepStrictEqual(disconnected.map((event) => event.data), [{ connectionId: "con_slackshr01", mode: "shared", userId: null, reason: "mode_changed", tokenSecretId }])
      assert.isTrue(events.some((event) => event.type === "resource.deleted" && event.target?.id === tokenSecretId))

      // Going back to shared does not bring the old tokens back: an admin must sign in again.
      const back = yield* Connections.use((connections) => connections.setMode(admin, slack.id, { mode: "shared" }))
      assert.deepInclude(back.config.kind === "integration" ? back.config.connection : {}, { status: "not_connected" })
      assert.notInclude(JSON.stringify(back.config), tokenSecretId)
    }).pipe(Effect.provide(connectionServices(fakeOAuthServer().fetch, events)))
  })

  it.effect("a member's cached tool list is dropped when they connect, reconnect or disconnect", () => {
    const server = fakeOAuthServer()
    return Effect.gen(function*() {
      yield* seed
      const key = upstreamUserToolsKey(linear.id, otherUserId)
      yield* prime(key)
      yield* Connections.use((connections) => connections.connectSecret(eve, linear.id, { value: Redacted.make("lin-eve-1") }))
      assert.isFalse(yield* cached(key))
      yield* prime(key)
      yield* Connections.use((connections) => connections.disconnect(eve, linear.id))
      assert.isFalse(yield* cached(key))

      const oauthKey = upstreamUserToolsKey(figma.id, otherUserId)
      for (const _attempt of [1, 2]) {
        yield* prime(oauthKey)
        const started = yield* Connections.use((connections) => connections.startOAuth(eve, figma.id))
        const state = new URL(started.authorizeUrl).searchParams.get("state") ?? ""
        assert.include(yield* ConnectionCallback.use((callback) => callback.complete({ state, code: "c" }, Option.some(eve))), "connection=connected")
        assert.isFalse(yield* cached(oauthKey))
      }
    }).pipe(Effect.provide(connectionServices(server.fetch, [])))
  })

  it.effect("a mode switch drops every per-user tool list along with the accounts", () =>
    Effect.gen(function*() {
      yield* seed
      const figmaKey = upstreamUserToolsKey(figma.id, otherUserId)
      yield* insertRow("connections", {
        id: "con_figmaeve01", orgId, resourceId: figma.id, userId: otherUserId, mode: "per_user", method: "oauth", status: "connected",
        connectedBy: otherUserId, connectedAt: DateTime.formatIso(now)
      })
      yield* prime(figmaKey)
      yield* prime(upstreamToolsKey(figma.id))
      yield* Connections.use((connections) => connections.setMode(admin, figma.id, { mode: "shared" }))
      assert.isFalse(yield* cached(figmaKey))
      assert.isFalse(yield* cached(upstreamToolsKey(figma.id)))
      assert.deepStrictEqual(yield* selectRows("SELECT id FROM connections WHERE resource_id = ?", figma.id), [])
    }).pipe(Effect.provide(connectionServices(fakeOAuthServer().fetch, []))))
})
