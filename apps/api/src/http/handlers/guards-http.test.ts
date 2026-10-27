import { assert, describe, it } from "@effect/vitest"
import { Authentication, CurrentPrincipal, DeliveryAuthentication, Guard, PrimitiveApi, SessionAuthentication, Unauthorized } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { HttpClientRequest, HttpServer } from "effect/http"
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api"
import { GuardsRepo } from "../../guards/guards-repo"
import { admin, guard, guardWorld } from "../../testing/guard-world"
import { GuardsHandlers } from "./guards"

/** Every request is the admin: this test is about the verify contract, not authentication. */
const asAdmin = Layer.succeed(Authentication, {
  session: (httpEffect) => Effect.provideService(httpEffect, CurrentPrincipal, admin),
  bearer: (httpEffect) => Effect.provideService(httpEffect, CurrentPrincipal, admin)
})
const otherSchemes = Layer.mergeAll(
  Layer.succeed(SessionAuthentication, { session: () => Effect.fail(new Unauthorized({ reason: "missing_credentials" })) }),
  Layer.succeed(DeliveryAuthentication, { bearer: () => Effect.fail(new Unauthorized({ reason: "missing_credentials" })) })
)
const attach = HttpApiMiddleware.layerClient(Authentication, ({ next, request }) => next(HttpClientRequest.bearerToken(request, "pc_test")))

describe("POST /api/guards/:id/compile over HTTP", () => {
  it.effect("answers 202 at once with the guard carrying a queued run, and queues one message", () => {
    const { queue, drafts, layer } = guardWorld()
    const world = GuardsHandlers.pipe(Layer.provideMerge(Layer.merge(asAdmin, otherSchemes)), Layer.provideMerge(layer), Layer.provideMerge(HttpServer.layerServices))
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const api = yield* HttpApiTest.groups(PrimitiveApi, ["guards"]).pipe(Effect.provide(attach))
      const response = yield* api.guards.compile({ params: { id: guard.id }, responseMode: "response-only" }).pipe(Effect.provide(attach))
      assert.strictEqual(response.status, 202)
      const body = yield* Schema.decodeUnknownEffect(Schema.toCodecJson(Guard))(yield* response.json)
      assert.strictEqual(body.verify?.stage, "queued")
      assert.deepStrictEqual(body.verify?.timeline.map((step) => step.stage), ["queued"])
      assert.strictEqual(body.compiled, null)
      assert.strictEqual(drafts.length, 0)
      assert.deepStrictEqual(queue.sent.map((sent) => [sent.message.runId, sent.message.stage]), [[body.verify?.runId, "queued"]])

      const fetched = yield* api.guards.get({ params: { id: guard.id } }).pipe(Effect.provide(attach))
      assert.strictEqual(fetched.verify?.runId, body.verify?.runId)
      const cancelled = yield* api.guards.cancelVerify({ params: { id: guard.id } }).pipe(Effect.provide(attach))
      assert.strictEqual(cancelled.verify?.stage, "cancelled")
    }).pipe(Effect.provide(world))
  })
})

describe("POST /api/guards/from-starter over HTTP", () => {
  it.effect("answers 201 with a compiled draft whose verify is done, and queues nothing", () => {
    const { queue, layer } = guardWorld()
    const world = GuardsHandlers.pipe(Layer.provideMerge(Layer.merge(asAdmin, otherSchemes)), Layer.provideMerge(layer), Layer.provideMerge(HttpServer.layerServices))
    return Effect.gen(function*() {
      const api = yield* HttpApiTest.groups(PrimitiveApi, ["guards"]).pipe(Effect.provide(attach))
      const payload = { starterId: "slack-no-channel-mentions", mode: "monitor", threshold: 0.7, projectId: null, resourceIds: [] } as const
      const response = yield* api.guards.createFromStarter({ payload, responseMode: "response-only" }).pipe(Effect.provide(attach))
      assert.strictEqual(response.status, 201)
      const body = yield* Schema.decodeUnknownEffect(Schema.toCodecJson(Guard))(yield* response.json)
      assert.deepStrictEqual([body.status, body.verify?.stage, body.compiled?.starter], ["draft", "done", "slack-no-channel-mentions"])
      assert.strictEqual(queue.sent.length, 0)
    }).pipe(Effect.provide(world))
  })
})
