import { Effect, Exit, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { WorkOS } from "../auth/workos"
import { Provisioning } from "./provisioning"
import { EventEnvelope, HandledEvents, WorkosEvent } from "./workos-events"

const decodeEnvelope = Schema.decodeUnknownExit(Schema.fromJsonString(EventEnvelope))
const decodeEvent = Schema.decodeUnknownExit(Schema.fromJsonString(WorkosEvent))

/** WorkOS events. The signature covers the raw body, so it is verified before anything is parsed. */
const workosWebhook = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const body = yield* Effect.orDie(request.text)
  const valid = yield* WorkOS.use((workos) => workos.verifyWebhook(body, request.headers["workos-signature"] ?? ""))
  if (!valid) return HttpServerResponse.jsonUnsafe({ error: "invalid signature" }, { status: 401 })

  const envelope = decodeEnvelope(body)
  if (Exit.isFailure(envelope)) return HttpServerResponse.jsonUnsafe({ error: "malformed event" }, { status: 400 })
  yield* Effect.annotateCurrentSpan({ "workos.event": envelope.value.event })
  if (!HandledEvents.has(envelope.value.event)) return HttpServerResponse.jsonUnsafe({ ok: true, ignored: true })

  const event = decodeEvent(body)
  // A handled event we cannot decode must not be acknowledged, so WorkOS retries it.
  if (Exit.isFailure(event)) return HttpServerResponse.jsonUnsafe({ error: "unexpected event shape" }, { status: 422 })
  yield* Provisioning.use((provisioning) => provisioning.apply(event.value))
  return HttpServerResponse.jsonUnsafe({ ok: true })
}).pipe(Effect.withSpan("webhooks.workos"))

export const WebhookRoutes = HttpRouter.add("POST", "/webhooks/workos", workosWebhook)
