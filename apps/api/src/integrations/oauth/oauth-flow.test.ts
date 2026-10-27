import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type IntegrationConfig, PieceId, type Resource, ResourceId } from "@pc/domain"
import { DateTime, Effect, Layer, Option, Redacted } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { ConnectionsRepo } from "../../connections/connections-repo"
import { actorOf } from "../../audit/actor"
import { AppConfig } from "../../platform/config"
import { toBase64 } from "../../platform/encoding"
import { SingleUseStore } from "../../platform/single-use-states"
import { ProjectsRepo } from "../../org/projects-repo"
import { Resources } from "../../resources/resources"
import { ResourcesRepo } from "../../resources/resources-repo"
import { importKek } from "../../secrets/envelope"
import { KeyRing } from "../../secrets/key-ring"
import { Secrets } from "../../secrets/secrets"
import { SecretVersionsRepo } from "../../secrets/versions-repo"
import { TestDatabase } from "../../testing/database"
import { now, orgId, otherUserId, userId, userPrincipal } from "../../testing/fixtures"
import { memoryKv } from "../../testing/gateway-fakes"
import { memoryAuditQueue, seedOrg, seedUser, selectRows } from "../../testing/seed"
import { testConfig } from "../../testing/config"
import { noConnections } from "../../testing/connection-fakes"
import { databaseVisibility } from "../../testing/visibility"
import { IntegrationCatalog } from "../catalog"
import { IntegrationCredentials } from "../credentials"
import { OAuthCallback } from "./callback"
import { IntegrationOAuth } from "./flow"
import { OAuthStates } from "./state-store"
import { TokenEndpoint, TokenRequestFailed } from "./token-endpoint"
import { OAuthTokens } from "./tokens"

const clientSecretId = ResourceId.make("res_slackapp01")
const slack: Resource = {
  id: ResourceId.make("res_slack00001"),
  orgId,
  projectId: null,
  name: "Slack",
  description: "",
  config: { kind: "integration", pieceId: PieceId.make("slack"), connection: { type: "oauth2", clientId: "123.456", clientSecretId, status: "not_connected" } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

type Grant = Readonly<Record<string, string>>
/** A provider token endpoint: answers each grant with the next scripted response. */
const scriptedEndpoint = (grants: Array<Grant>, responses: Array<Effect.Effect<Record<string, unknown>, TokenRequestFailed>>) =>
  Layer.succeed(TokenEndpoint, {
    request: (_url, client, grant) =>
      Effect.suspend(() => {
        grants.push({ ...grant, client_id: client.clientId, client_secret: client.authentication === "none" ? "" : Redacted.value(client.clientSecret) })
        return responses.shift() ?? Effect.die("no scripted response")
      }).pipe(Effect.map((json) => JSON.parse(JSON.stringify(json))))
  })

const services = (grants: Array<Grant>, responses: Array<Effect.Effect<Record<string, unknown>, TokenRequestFailed>>, events: Array<AuditEvent>) =>
  Layer.mergeAll(IntegrationOAuth.layer, OAuthCallback.layer, IntegrationCredentials.layer, Resources.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(OAuthTokens.layer, databaseVisibility)),
    Layer.provideMerge(Layer.mergeAll(Secrets.layer, OAuthStates.layer, IntegrationCatalog.layer, scriptedEndpoint(grants, responses), noConnections)),
    Layer.provideMerge(Layer.mergeAll(ResourcesRepo.layer, ConnectionsRepo.layer, ProjectsRepo.layer, SecretVersionsRepo.layer, AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))), memoryKv(), SingleUseStore.layer)),
    Layer.provideMerge(Layer.mergeAll(TestDatabase, Layer.succeed(AppConfig, testConfig), Layer.effect(KeyRing, Effect.map(
      importKek("kek-test", Redacted.make(toBase64(crypto.getRandomValues(new Uint8Array(32))))).pipe(Effect.orDie),
      (kek) => KeyRing.make(kek)
    ))))
  )

const seed = Effect.gen(function*() {
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02", "admin")
  const repo = yield* ResourcesRepo
  yield* repo.insert({ ...slack, id: clientSecretId, name: "Slack app secret", config: { kind: "secret" } })
  yield* Secrets.use((secrets) => secrets.store(clientSecretId, Redacted.make("slack-client-secret"), userId))
  yield* repo.insert(slack)
})

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? ""
const configOf: Effect.Effect<IntegrationConfig, never, ResourcesRepo> = Effect.flatMap(ResourcesRepo.use((repo) => repo.find(orgId, slack.id)), (found) => {
  const config = Option.getOrUndefined(found)?.config
  return config?.kind === "integration" ? Effect.succeed(config) : Effect.die("expected the Slack integration")
})

describe("integration OAuth2", () => {
  it.effect("connects through the authorization-code flow and refreshes an expiring token before a run", () => {
    const grants: Array<Grant> = []
    const events: Array<AuditEvent> = []
    const responses = [
      Effect.succeed({ ok: true, access_token: "xoxb-1", refresh_token: "xoxe-r1", token_type: "bot", scope: "chat:write", expires_in: 30, authed_user: { access_token: "xoxp-1" } }),
      Effect.succeed({ access_token: "xoxb-2", expires_in: 43200 })
    ]
    return Effect.gen(function*() {
      yield* seed
      const started = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, slack.id))
      const authorize = new URL(started.authorizeUrl)
      assert.strictEqual(authorize.origin + authorize.pathname, "https://slack.com/oauth/v2/authorize")
      assert.include(authorize.searchParams.get("user_scope") ?? "", "chat:write")
      assert.deepStrictEqual(
        ["client_id", "redirect_uri", "response_type"].map((key) => authorize.searchParams.get(key)),
        ["123.456", "https://api.example.com/api/integrations/oauth/callback", "code"]
      )

      const landing = yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "code-1" }, Option.some(admin)))
      assert.strictEqual(landing, `https://app.example.com/resources/${slack.id}?integration=connected`)
      assert.deepInclude(grants[0], { grant_type: "authorization_code", code: "code-1", client_secret: "slack-client-secret" })
      const connected = yield* configOf
      assert.deepInclude(connected.connection, { type: "oauth2", status: "connected" })
      assert.include(events.map((event) => event.type), "integration.connected")

      const resource = { ...slack, config: connected }
      const auth = yield* IntegrationCredentials.use((credentials) => credentials.forRun(resource, connected, admin, actorOf(admin)))
      assert.strictEqual(auth.type === "oauth2" ? Redacted.value(auth.accessToken) : "", "xoxb-2")
      const data = auth.type === "oauth2" ? Redacted.value(auth.data) : {}
      assert.deepInclude(data, { authed_user: { access_token: "xoxp-1" } })
      // The refresh token serves apps/api's own refreshes only; it never travels to the integrations Worker.
      assert.notProperty(data, "refresh_token")
      assert.deepInclude(grants[1], { grant_type: "refresh_token", refresh_token: "xoxe-r1" })
      const rotated = events.find((event) => event.type === "secret.rotated")
      assert.deepStrictEqual([rotated?.actor, rotated?.data.reason], [{ type: "system", id: "oauth-refresh" }, "oauth_refresh"])
      assert.notInclude(JSON.stringify(events), "xoxb-")

      const replay = yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "code-1" }, Option.some(admin)))
      assert.include(replay, "reason=expired_state")

      // Deleting the integration takes its managed token secret with it: no orphaned refresh token stays live.
      const tokenSecretId = connected.connection.type === "oauth2" ? connected.connection.tokenSecretId : undefined
      if (tokenSecretId === undefined) return yield* Effect.die("expected a managed token secret")
      yield* Resources.use((resources) => resources.remove(admin, slack.id))
      assert.isTrue(Option.isNone(yield* ResourcesRepo.use((repo) => repo.find(orgId, tokenSecretId))))
      assert.isTrue(events.some((event) => event.type === "resource.deleted" && event.target?.id === tokenSecretId && event.data.reason === "integration_deleted"))
    }).pipe(Effect.provide(services(grants, responses, events)))
  })

  it.effect("completes only for the user who started the flow, and marks a revoked connection for re-authorization", () => {
    const events: Array<AuditEvent> = []
    const responses = [
      Effect.succeed({ access_token: "xoxb-1", refresh_token: "xoxe-r1", expires_in: 1 }),
      Effect.fail(new TokenRequestFailed({ status: 400, error: "invalid_grant" }))
    ]
    return Effect.gen(function*() {
      yield* seed
      const first = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, slack.id))
      const other = userPrincipal({ userId: otherUserId, permissions: ["resources:manage"] })
      const hijack = yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(first.authorizeUrl), code: "c" }, Option.some(other)))
      assert.include(hijack, "reason=session_mismatch")

      const second = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, slack.id))
      yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(second.authorizeUrl), code: "c" }, Option.some(admin)))
      const connected = yield* configOf
      const failure = yield* Effect.flip(IntegrationCredentials.use((credentials) => credentials.forRun({ ...slack, config: connected }, connected, admin, actorOf(admin))))
      assert.include(failure.message, "connect the integration again")
      assert.deepInclude((yield* configOf).connection, { status: "needs_reauth" })

      const disconnected = yield* IntegrationOAuth.use((oauth) => oauth.disconnect(admin, slack.id))
      assert.deepStrictEqual(disconnected.config.kind === "integration" ? disconnected.config.connection : null, {
        type: "oauth2", clientId: "123.456", clientSecretId, status: "not_connected"
      })
      assert.isTrue(DateTime.isDateTime(disconnected.updatedAt))
    }).pipe(Effect.provide(services([], responses, events)))
  })

  it.effect("returns to the setup flow when it started there, connected or not", () => {
    const responses = [Effect.succeed({ access_token: "xoxb-1", expires_in: 3600 })]
    return Effect.gen(function*() {
      yield* seed
      const denied = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, slack.id, "setup"))
      const cancelled = yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(denied.authorizeUrl), error: "access_denied" }, Option.some(admin)))
      assert.strictEqual(cancelled, `https://app.example.com/setup?step=tool&resource=${slack.id}&integration=error&reason=denied`)
      const started = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, slack.id, "setup"))
      const landing = yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "c" }, Option.some(admin)))
      assert.strictEqual(landing, `https://app.example.com/setup?step=tool&resource=${slack.id}&integration=connected`)
    }).pipe(Effect.provide(services([], responses, [])))
  })

  it.effect("an integration created and connected over OAuth2 gives its creator one grant, and its token secret none", () => {
    const events: Array<AuditEvent> = []
    const responses = [Effect.succeed({ access_token: "xoxb-1", refresh_token: "xoxe-r1", expires_in: 3600 })]
    return Effect.gen(function*() {
      yield* seed
      const created = yield* Resources.use((resources) => resources.create(admin, {
        name: "Slack (ops)",
        description: "",
        projectId: null,
        config: { kind: "integration", pieceId: PieceId.make("slack"), connection: { type: "oauth2", clientId: "123.456", clientSecretId } }
      }))
      const started = yield* IntegrationOAuth.use((oauth) => oauth.start(admin, created.id))
      yield* OAuthCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "c" }, Option.some(admin)))
      const grants = yield* selectRows("SELECT resource_id, subject_id, action FROM grants")
      assert.deepStrictEqual(grants, [{ resourceId: created.id, subjectId: userId, action: "admin" }])
      assert.deepStrictEqual(events.filter((event) => event.type === "grant.created").map((event) => event.data.reason), ["creator"])
    }).pipe(Effect.provide(services([], responses, events)))
  })
})
