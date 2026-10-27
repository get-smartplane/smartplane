import { TraceContext, TraceParent } from "@pc/domain"
import { Effect, Option, Schema, type Tracer } from "effect"
import { Headers, HttpTraceContext } from "effect/http"

const isTraceParent = Schema.is(TraceParent)
const decodeTrace = Schema.decodeUnknownOption(TraceContext)

const traceparentOf = (span: Tracer.AnySpan): string =>
  `00-${span.traceId.padStart(32, "0")}-${span.spanId}-${span.sampled ? "01" : "00"}`

/**
 * The W3C trace context of the current span, for work that continues elsewhere (a queue consumer, a
 * Durable Object). None outside a span, or when the tracer's ids are not W3C-shaped.
 */
export const currentTraceContext: Effect.Effect<Option.Option<TraceContext>> = Effect.currentParentSpan.pipe(
  Effect.map((span) => Option.map(Option.liftPredicate(traceparentOf(span), isTraceParent), (traceparent) => ({ traceparent }))),
  Effect.orElseSucceed(() => Option.none())
)

/** The remote span a trace context names. Untrusted input that does not decode is ignored, never fatal. */
export const remoteSpan = (trace: unknown): Option.Option<Tracer.ExternalSpan> =>
  Option.flatMap(decodeTrace(trace), ({ traceparent }) => HttpTraceContext.w3c(Headers.fromRecordUnsafe({ traceparent })))

export interface ContinueOptions {
  readonly kind?: Tracer.SpanKind
  readonly attributes?: Record<string, unknown>
  /** Further traces this work also serves (other messages of a batch); recorded as span links. */
  readonly links?: ReadonlyArray<Tracer.AnySpan>
}

/** Wraps `effect` in a span whose parent is the span `trace` names, so the work joins the caller's trace. */
export const continueTrace = (name: string, trace: unknown, options: ContinueOptions = {}) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(effect, name, {
    kind: options.kind,
    attributes: options.attributes,
    parent: Option.getOrUndefined(remoteSpan(trace)),
    links: (options.links ?? []).map((span) => ({ span, attributes: {} }))
  })
