import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type Resource, ResourceId } from "@pc/domain"
import { Effect, Layer, Logger, Option, Tracer } from "effect"
import { actorOf } from "../../audit/actor"
import { connectionServices, grantRow, resourceRow } from "../../testing/connection-harness"
import { fakeOAuthServer, issuer, mcpUrl } from "../../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../../testing/fixtures"
import { seedOrg, seedUser } from "../../testing/seed"
import { Connections } from "../connections"
import { ConnectionResolver } from "../resolver"
import { ConnectionCallback } from "./callback"

const figma: Resource = {
  id: ResourceId.make("res_figmamcp01"),
  orgId,
  projectId: null,
  name: "Figma",
  description: "",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth" } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const member = userPrincipal({ userId: otherUserId, permissions: ["resources:read"] })
const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? ""

const sha256Base64Url = (value: string) =>
  Effect.promise(async () => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))))
    .pipe(Effect.map((b64) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")))

const seed = (resource: Resource) =>
  Effect.gen(function*() {
    yield* seedOrg
    yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
    yield* resourceRow(resource)
    yield* grantRow("grt_eveuse0001", resource.id, otherUserId)
  })

describe("OAuth connections to upstream MCP servers", () => {
  it.effect("discovers, registers a client, signs in with PKCE and the resource indicator, and stores the shared account encrypted", () => {
    const server = fakeOAuthServer({ email: "design@acme.com" })
    const events: Array<AuditEvent> = []
    const spans: Array<Tracer.NativeSpan> = []
    const logs: Array<string> = []
    const tracer = Tracer.make({ span: (options) => { const span = new Tracer.NativeSpan(options); spans.push(span); return span } })
    const logger = Logger.make(({ message }) => void logs.push(JSON.stringify(message)))
    return Effect.gen(function*() {
      yield* seed(figma)
      // Members cannot connect the shared account; admins can.
      const refused = yield* Effect.flip(Connections.use((connections) => connections.startOAuth(member, figma.id)))
      assert.strictEqual(refused._tag, "Forbidden")
      const started = yield* Connections.use((connections) => connections.startOAuth(admin, figma.id))

      // RFC 9728 → RFC 8414 → RFC 7591, all through the fake network.
      const paths = server.seen.map((request) => new URL(request.url).pathname)
      assert.includeMembers(paths, ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server", "/register"])
      const registration = JSON.parse(server.seen.find((request) => request.url.endsWith("/register"))?.body ?? "{}")
      assert.deepInclude(registration, { redirect_uris: ["https://api.example.com/api/connections/oauth/callback"], token_endpoint_auth_method: "client_secret_basic" })

      const authorize = new URL(started.authorizeUrl)
      assert.strictEqual(authorize.origin + authorize.pathname, `${issuer}/authorize`)
      assert.deepStrictEqual(
        ["client_id", "response_type", "code_challenge_method", "resource", "scope"].map((key) => authorize.searchParams.get(key)),
        ["dcr-client-1", "code", "S256", mcpUrl, "files:read files:write"]
      )

      // The state is bound to the starting user's session and is single use.
      const hijack = yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "c" }, Option.some(member)))
      assert.include(hijack, "reason=session_mismatch")
      const replay = yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "c" }, Option.some(admin)))
      assert.include(replay, "reason=expired_state")

      const again = yield* Connections.use((connections) => connections.startOAuth(admin, figma.id))
      const landing = yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(again.authorizeUrl), code: "code-1" }, Option.some(admin)))
      assert.strictEqual(landing, `https://app.example.com/resources/${figma.id}?connection=connected`)

      // The code exchange proves the PKCE verifier and names the resource; the DCR secret goes in a Basic header.
      const exchange = server.seen.find((request) => request.form.grant_type === "authorization_code")
      assert.strictEqual(yield* sha256Base64Url(exchange?.form.code_verifier ?? ""), new URL(again.authorizeUrl).searchParams.get("code_challenge"))
      assert.deepInclude(exchange?.form, { code: "code-1", resource: mcpUrl, redirect_uri: "https://api.example.com/api/connections/oauth/callback" })
      assert.strictEqual(exchange?.authorization, `Basic ${btoa("dcr-client-1:dcr-secret-1")}`)

      const state = yield* Connections.use((connections) => connections.forResource(admin, figma.id))
      assert.deepInclude(state.shared, { mode: "shared", method: "oauth", status: "connected", accountIdentity: { email: "design@acme.com", subject: "acct-42" } })
      assert.deepStrictEqual(state.shared?.connectedBy, { userId, email: "ada@example.com" })

      // A member using the shared account gets the shared tokens (decrypted only now, audited as a secret read).
      const credential = yield* ConnectionResolver.use((resolver) => resolver.credential(figma, member, actorOf(member)))
      assert.strictEqual(credential.type === "oauth" ? credential.tokens.accessToken : "", "at-1")
      const connected = events.find((event) => event.type === "connection.connected")
      assert.deepInclude(connected?.data, { mode: "shared", method: "oauth", accountIdentity: { email: "design@acme.com", subject: "acct-42" }, refreshable: true })
      assert.deepStrictEqual(connected?.target, { type: "resource", id: figma.id })
      assert.isTrue(events.some((event) => event.type === "secret.accessed" && event.target?.type === "connection" && event.actor.id === otherUserId))

      // No token, refresh token or client secret in audit data, span attributes or logs.
      const recorded = JSON.stringify([events, spans.map((span) => [span.name, Object.fromEntries(span.attributes)]), logs])
      for (const secret of ["at-1", "rt-secret-1", "dcr-secret-1", exchange?.form.code_verifier ?? "verifier"]) assert.notInclude(recorded, secret)
      assert.isTrue(spans.some((span) => span.name === "ConnectionCallback.complete"))

      const disconnected = yield* Connections.use((connections) => connections.disconnect(admin, figma.id))
      assert.isNull(disconnected.shared)
      assert.isTrue(events.some((event) => event.type === "connection.disconnected"))
    }).pipe(
      Effect.provide(connectionServices(server.fetch, events)),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provide(Logger.layer([logger]))
    )
  })

  it.effect("uses an admin-supplied client when the server offers no registration", () => {
    const server = fakeOAuthServer({ dcr: false })
    const configured: Resource = { ...figma, config: { ...figma.config, kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth", clientId: "admin-client", scopes: ["files:read"] } } }
    return Effect.gen(function*() {
      yield* seed(configured)
      const started = yield* Connections.use((connections) => connections.startOAuth(admin, figma.id))
      assert.deepStrictEqual([new URL(started.authorizeUrl).searchParams.get("client_id"), new URL(started.authorizeUrl).searchParams.get("scope")], ["admin-client", "files:read"])
      assert.isFalse(server.seen.some((request) => request.url.endsWith("/register")))
      yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(started.authorizeUrl), code: "c" }, Option.some(admin)))
      // A public client sends its id in the form and no secret.
      const exchange = server.seen.find((request) => request.form.grant_type === "authorization_code")
      assert.deepStrictEqual([exchange?.form.client_id, exchange?.authorization], ["admin-client", null])
    }).pipe(Effect.provide(connectionServices(server.fetch, [])))
  })

  it.effect("refuses metadata that describes another resource", () => {
    const server = fakeOAuthServer()
    const elsewhere: Resource = { ...figma, config: { kind: "mcp_server", url: "https://other.example.com/mcp", transport: "streamable_http", auth: { type: "oauth" } } }
    const redirecting: typeof fetch = (input, init) => {
      const url = new URL(new Request(input, init).url)
      return url.origin === "https://other.example.com" ? server.fetch(`https://mcp.example.com${url.pathname}`, init) : server.fetch(input, init)
    }
    return Effect.gen(function*() {
      yield* seed(elsewhere)
      const failure = yield* Effect.flip(Connections.use((connections) => connections.startOAuth(admin, figma.id)))
      assert.strictEqual(failure._tag, "UpstreamFailure")
      assert.include(failure.message, "not this server")
    }).pipe(Effect.provide(connectionServices(redirecting, [])))
  })
})
