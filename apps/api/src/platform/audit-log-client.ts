import { type AuditEvent, AuditUnavailable, type ChainVerification, type OrgId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { AuditEventsWire, ChainVerificationWire } from "../audit/wire"
import { currentTraceContext } from "../telemetry/trace-context"
import { WorkerBindings } from "./bindings"

/** The caller's trace context, so the Durable Object's spans join the caller's trace. */
const trace = Effect.map(currentTraceContext, Option.getOrUndefined)

const unavailable = (cause: unknown) => new AuditUnavailable({ message: `audit log append failed: ${String(cause)}` })

/** RPC client for the per-org AuditLog Durable Object. */
export class AuditLogClient extends Context.Service<AuditLogClient, {
  /** Idempotent on event id; a rejected RPC (D1 blip, object reset) is a typed, retryable failure. */
  readonly append: (orgId: OrgId, events: ReadonlyArray<AuditEvent>) => Effect.Effect<number, AuditUnavailable>
  readonly verify: (orgId: OrgId, fromSeq: number) => Effect.Effect<ChainVerification>
}>()("api/platform/AuditLogClient") {
  static readonly layer = Layer.effect(
    AuditLogClient,
    Effect.gen(function*() {
      const namespace = (yield* WorkerBindings).AUDIT_LOG
      const stub = (orgId: OrgId) => namespace.get(namespace.idFromName(orgId))

      return AuditLogClient.of({
        append: Effect.fn("AuditLogClient.append")(function*(orgId: OrgId, events: ReadonlyArray<AuditEvent>) {
          const wire = yield* Schema.encodeEffect(AuditEventsWire)(events).pipe(Effect.orDie)
          const context = yield* trace
          return yield* Effect.tryPromise({ try: () => stub(orgId).append(orgId, wire, context), catch: unavailable })
        }),
        verify: Effect.fn("AuditLogClient.verify")(function*(orgId: OrgId, fromSeq: number) {
          const context = yield* trace
          const wire = yield* Effect.promise(() => stub(orgId).verify(orgId, fromSeq, context))
          return yield* Schema.decodeUnknownEffect(ChainVerificationWire)(wire).pipe(Effect.orDie)
        })
      })
    })
  )
}
