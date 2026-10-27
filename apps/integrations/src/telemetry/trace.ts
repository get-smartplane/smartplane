import { TraceContext } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { Headers, HttpTraceContext } from "effect/http"

const decodeTrace = Schema.decodeUnknownOption(TraceContext)

/** Runs `effect` as a child of the caller's span (apps/api's tool call), so one trace covers both Workers. */
export const continueTrace = (name: string, trace: unknown, attributes: Record<string, unknown>) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(effect, name, {
    kind: "server",
    attributes,
    parent: Option.getOrUndefined(
      Option.flatMap(decodeTrace(trace), ({ traceparent }) => HttpTraceContext.w3c(Headers.fromRecordUnsafe({ traceparent })))
    )
  })
