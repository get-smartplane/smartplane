import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type Resource, ResourceId } from "@pc/domain"
import { Effect, Option, Redacted } from "effect"
import { ResourcesRepo } from "../../resources/resources-repo"
import { Secrets } from "../../secrets/secrets"
import { connectionServices, grantRow, resourceRow } from "../../testing/connection-harness"
import { fakeOAuthServer, type FakeOAuthOptions, issuer, mcpUrl } from "../../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../../testing/fixtures"
import { seedOrg, seedUser } from "../../testing/seed"
import { Connections } from "../connections"
import { ConnectionCallback } from "./callback"

const clientSecretId = ResourceId.make("res_figmasec01")
const base = { orgId, projectId: null, description: "", createdBy: userId, createdAt: now, updatedAt: null }
const figma: Resource = {
  ...base,
  id: ResourceId.make("res_figmamcp01"),
  name: "Figma",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth" } }
}
const withClient: Resource = {
  ...figma,
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth", clientId: "admin-client", clientSecretId } }
}

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? ""

const seed = (resource: Resource) =>
  Effect.gen(function*() {
    yield* seedOrg
    yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
    yield* resourceRow({ ...figma, id: clientSecretId, name: "Figma client secret", config: { kind: "secret" } })
    yield* Secrets.use((secrets) => secrets.store(clientSecretId, Redacted.make("admin-client-secret"), userId))
    yield* resourceRow(resource)
    yield* grantRow("grt_eveuse0001", resource.id, otherUserId)
  })

const start = Connections.use((connections) => connections.startOAuth(admin, figma.id))
const connect = Effect.gen(function*() {
  const started = yield* start
  return yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "code-1" }, Option.some(admin)))
})

/** Starting must fail with `message`, before anything is registered or any token endpoint is called. */
const refusedStart = (options: FakeOAuthOptions, message: RegExp) => {
  const server = fakeOAuthServer(options)
  return Effect.gen(function*() {
    yield* seed(figma)
    const failure = yield* Effect.flip(start)
    assert.strictEqual(failure._tag, "UpstreamFailure")
    assert.match(failure.message, message)
    assert.isFalse(server.seen.some((request) => request.url.endsWith("/register") || request.url.endsWith("/token")))
  }).pipe(Effect.provide(connectionServices(server.fetch, [])))
}

describe("OAuth discovery only trusts endpoints it may send credentials to", () => {
  it.effect("refuses a plain-http token endpoint", () => refusedStart({ metadata: { token_endpoint: "http://auth.example.com/token" } }, /token_endpoint is refused/))

  it.effect("refuses a private-address registration endpoint", () =>
    refusedStart({ metadata: { registration_endpoint: "https://10.0.0.7/register" } }, /registration_endpoint is refused/))

  it.effect("refuses an authorization endpoint on a non-default port", () =>
    refusedStart({ metadata: { authorization_endpoint: "https://auth.example.com:8443/authorize" } }, /authorization_endpoint is refused/))

  it.effect("refuses metadata whose issuer is not the authorization server it came from (RFC 8414 §3.3)", () =>
    refusedStart({ metadata: { issuer: "https://elsewhere.example.com" } }, /issuer/i))

  it.effect("never fetches an authorization server in private or metadata address space", () => {
    const server = fakeOAuthServer({ issuer: "http://169.254.169.254" })
    return Effect.gen(function*() {
      yield* seed(figma)
      assert.strictEqual((yield* Effect.flip(start))._tag, "UpstreamFailure")
      assert.isFalse(server.seen.some((request) => request.url.startsWith("http://169.254.169.254")))
    }).pipe(Effect.provide(connectionServices(server.fetch, [])))
  })

  it.effect("sends the access token only to a userinfo endpoint on the issuer's own host", () => {
    const elsewhere = fakeOAuthServer({ idToken: false, metadata: { userinfo_endpoint: "https://tracker.example.net/userinfo" } })
    const sameHost = fakeOAuthServer({ idToken: false })
    return Effect.gen(function*() {
      yield* Effect.gen(function*() {
        yield* seed(figma)
        assert.include(yield* connect, "connection=connected")
        assert.isFalse(elsewhere.seen.some((request) => request.url.includes("tracker.example.net")))
        const state = yield* Connections.use((connections) => connections.forResource(admin, figma.id))
        assert.isNull(state.shared?.accountIdentity)
      }).pipe(Effect.provide(connectionServices(elsewhere.fetch, [])))
      yield* Effect.gen(function*() {
        yield* seed(figma)
        yield* connect
        assert.isTrue(sameHost.seen.some((request) => request.url === `${issuer}/userinfo` && request.authorization === "Bearer at-1"))
      }).pipe(Effect.provide(connectionServices(sameHost.fetch, [])))
    })
  })
})

describe("an admin-supplied client stays with its authorization server", () => {
  it.effect("pins the issuer and token endpoint on first sign-in, then refuses a server that names another one", () => {
    const options: FakeOAuthOptions = { dcr: false }
    const server = fakeOAuthServer(options)
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed(withClient)
      assert.include(yield* connect, "connection=connected")
      const pinned = yield* ResourcesRepo.use((repo) => repo.find(orgId, figma.id))
      assert.deepInclude(Option.getOrUndefined(pinned)?.config, { auth: { type: "oauth", clientId: "admin-client", clientSecretId, issuer, tokenEndpoint: `${issuer}/token` } })

      // The MCP server now names an authorization server of its choosing: valid HTTPS, matching issuer, still refused.
      options.issuer = "https://attacker.example.com"
      server.seen.length = 0
      const refused = yield* Effect.flip(start)
      assert.deepInclude(refused, { _tag: "AuthorizationServerChanged", field: "issuer", resourceId: figma.id })
      assert.isFalse(server.seen.some((request) => request.url.startsWith("https://attacker.example.com/token")))
      const audited = events.find((event) => event.type === "connection.refreshed_failed")
      assert.deepInclude(audited?.data, { reason: "authorization_server_changed", field: "issuer", mode: "shared" })

      // Same issuer, another token endpoint: refused as well.
      options.issuer = issuer
      options.metadata = { token_endpoint: `${issuer}/v2/token` }
      assert.deepInclude(yield* Effect.flip(start), { _tag: "AuthorizationServerChanged", field: "token_endpoint" })
      // The client secret only ever went to the pinned token endpoint.
      assert.isFalse(server.seen.some((request) => request.form.client_secret !== undefined || (request.authorization ?? "").startsWith("Basic")))
    }).pipe(Effect.provide(connectionServices(server.fetch, events)))
  })

  it.effect("does not pin a dynamically registered client", () => {
    const server = fakeOAuthServer()
    return Effect.gen(function*() {
      yield* seed(figma)
      yield* connect
      const stored = yield* ResourcesRepo.use((repo) => repo.find(orgId, figma.id))
      assert.deepStrictEqual(Option.getOrUndefined(stored)?.config, figma.config)
    }).pipe(Effect.provide(connectionServices(server.fetch, [])))
  })
})
