import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type Principal, type Resource, ResourceId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { actorOf } from "../audit/actor"
import { textResult } from "../mcp/sdk"
import { Upstream } from "../mcp/upstream"
import { UpstreamClient, UpstreamUnauthorized } from "../mcp/upstream-client"
import { connectionServices, grantRow, resourceRow } from "../testing/connection-harness"
import { fakeOAuthServer, type FakeOAuthOptions, mcpUrl } from "../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { seedOrg, seedUser } from "../testing/seed"
import { Connections } from "./connections"
import { ConnectionCallback } from "./oauth/callback"
import { ConnectionResolver } from "./resolver"

const server: Resource = {
  id: ResourceId.make("res_linearmcp1"),
  orgId,
  projectId: null,
  name: "Linear",
  description: "",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth" } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}
const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const member = userPrincipal({ userId: otherUserId })

/** An upstream that refuses the first `refusals` calls with 401 and records the bearer token of each call. */
const upstreamRefusing = (refusals: number, tokens: Array<string>) =>
  Layer.succeed(UpstreamClient, {
    listTools: () => Effect.succeed([]),
    callTool: (target) =>
      Effect.suspend(() => {
        tokens.push(target.headers.authorization ?? "")
        return tokens.length <= refusals ? Effect.fail(new UpstreamUnauthorized()) : Effect.succeed(textResult("ok"))
      })
  })

const connectShared = (as: Principal) =>
  Effect.gen(function*() {
    yield* seedOrg
    yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
    yield* resourceRow(server)
    yield* grantRow("grt_eveuse0001", server.id, otherUserId)
    const started = yield* Connections.use((connections) => connections.startOAuth(as, server.id))
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? ""
    yield* ConnectionCallback.use((callback) => callback.complete({ state, code: "code-1" }, Option.some(as)))
  })

const services = (options: FakeOAuthOptions, refusals: number, tokens: Array<string>, events: Array<AuditEvent>) => {
  const fake = fakeOAuthServer(options)
  return { fake, layer: Upstream.layer.pipe(Layer.provide(upstreamRefusing(refusals, tokens)), Layer.provideMerge(connectionServices(fake.fetch, events))) }
}

const call = Upstream.use((upstream) => upstream.callTool(server, { principal: member, actor: actorOf(member) }, "list_issues", {}))

describe("OAuth connection tokens", () => {
  it.effect("refreshes once and retries when the server answers 401, sending the refresh grant with the resource", () => {
    const tokens: Array<string> = []
    const { fake, layer } = services({}, 1, tokens, [])
    return Effect.gen(function*() {
      yield* connectShared(admin)
      const result = yield* call
      assert.isFalse(result.isError)
      assert.deepStrictEqual(tokens, ["Bearer at-1", "Bearer at-2"])
      const refresh = fake.seen.find((request) => request.form.grant_type === "refresh_token")
      assert.deepInclude(refresh?.form, { refresh_token: "rt-secret-1", resource: mcpUrl })
      // The rotated tokens were stored: the next call uses them without refreshing again.
      yield* call
      assert.strictEqual(tokens.at(-1), "Bearer at-2")
    }).pipe(Effect.provide(layer))
  })

  it.effect("retries only once: a second 401 is an upstream failure", () => {
    const tokens: Array<string> = []
    const { layer } = services({}, 5, tokens, [])
    return Effect.gen(function*() {
      yield* connectShared(admin)
      const failure = yield* Effect.flip(call)
      assert.include(failure.message, "refused the credential")
      assert.strictEqual(tokens.length, 2)
    }).pipe(Effect.provide(layer))
  })

  it.effect("refreshes a token about to expire before using it", () => {
    const tokens: Array<string> = []
    const { layer } = services({}, 0, tokens, [])
    return Effect.gen(function*() {
      yield* connectShared(admin)
      yield* TestClock.adjust("3570 seconds")
      yield* call
      assert.deepStrictEqual(tokens, ["Bearer at-2"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("a refused refresh marks the connection for re-authorization and audits it", () => {
    const events: Array<AuditEvent> = []
    const { layer } = services({ refuseRefresh: true }, 1, [], events)
    return Effect.gen(function*() {
      yield* connectShared(admin)
      const failure = yield* Effect.flip(call)
      assert.include(failure.message, "connect the account again")
      const failed = events.find((event) => event.type === "connection.refreshed_failed")
      assert.deepInclude(failed?.data, { mode: "shared", reason: "refresh_rejected" })
      assert.deepStrictEqual(failed?.actor, { type: "system", id: "oauth-refresh" })
      const state = yield* Connections.use((connections) => connections.forResource(admin, server.id))
      assert.strictEqual(state.shared?.status, "needs_reauth")
      const context = yield* Effect.flip(ConnectionResolver.use((resolver) => resolver.context(server, member)))
      assert.strictEqual(context._tag, "AccountNotConnected")
    }).pipe(Effect.provide(layer))
  })
})
