import { type Actor, AuditEvent, type AuditEventId, type AuditEventType, type AuditTarget, type AuditUnavailable, type OrgId, type Principal } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { HttpServerRequest } from "effect/http"
import { AuditQueue } from "../platform/audit-queue"
import { Ids } from "../platform/ids"
import { currentTraceContext } from "../telemetry/trace-context"
import { actorOf } from "./actor"
import { boundAuditData } from "./bounded-data"

export interface AuditInput {
  readonly orgId: OrgId
  readonly type: AuditEventType
  readonly actor: Actor
  readonly target?: AuditTarget | null
  /** Never secret values or token plaintext. Oversized values are replaced by a hash marker. */
  readonly data?: Readonly<Record<string, unknown>>
  /** A deterministic id (see `derivedEventId`) makes re-recording the same fact after a retry a no-op. */
  readonly id?: AuditEventId
}

type Data = Readonly<Record<string, unknown>>

const MaxHeaderChars = 1024
const header = (value: string | undefined) => (value === undefined ? null : value.slice(0, MaxHeaderChars))

const requestMeta = Effect.map(Effect.serviceOption(HttpServerRequest.HttpServerRequest), (request) =>
  Option.match(request, {
    onNone: () => ({ ip: null, userAgent: null, requestId: null }),
    onSome: ({ headers }) => ({
      ip: header(headers["cf-connecting-ip"]),
      userAgent: header(headers["user-agent"]),
      requestId: header(headers["cf-ray"])
    })
  }))

const encodeForLog = Schema.encodeOption(Schema.toCodecJson(AuditEvent))

/**
 * Records audit events by enqueueing them; the per-org AuditLog Durable Object chains them.
 * `write`/`writeBy` surface `AuditUnavailable` for callers that must not proceed (or must react) unaudited;
 * `record`/`by` treat it as a defect, after logging the whole event so it can be replayed by hand.
 */
export class AuditLog extends Context.Service<AuditLog, {
  readonly write: (input: AuditInput) => Effect.Effect<AuditEvent, AuditUnavailable>
  readonly writeBy: (principal: Principal, type: AuditEventType, target: AuditTarget | null, data?: Data) => Effect.Effect<AuditEvent, AuditUnavailable>
  readonly record: (input: AuditInput) => Effect.Effect<AuditEvent>
  /** The common case: a principal acting within its own org. */
  readonly by: (principal: Principal, type: AuditEventType, target: AuditTarget | null, data?: Data) => Effect.Effect<AuditEvent>
}>()("api/audit/AuditLog") {
  static readonly layer = Layer.effect(
    AuditLog,
    Effect.gen(function*() {
      const queue = yield* AuditQueue
      const write = Effect.fn("AuditLog.write")(function*(input: AuditInput) {
        yield* Effect.annotateCurrentSpan({ "audit.type": input.type, "org.id": input.orgId })
        const event: AuditEvent = {
          id: input.id ?? (yield* Ids.auditEvent),
          orgId: input.orgId,
          type: input.type,
          actor: input.actor,
          target: input.target ?? null,
          data: yield* boundAuditData(input.data ?? {}),
          ...(yield* requestMeta),
          occurredAt: yield* DateTime.now
        }
        yield* queue.send(event, yield* currentTraceContext).pipe(
          Effect.tapError((error) =>
            Effect.logError("audit.undeliverable", {
              alert: "audit.undeliverable",
              eventId: event.id,
              orgId: event.orgId,
              type: event.type,
              error: error.message,
              event: Option.getOrNull(encodeForLog(event))
            }))
        )
        return event
      })
      const record = (input: AuditInput) => Effect.orDie(write(input))
      const writeBy = (principal: Principal, type: AuditEventType, target: AuditTarget | null, data?: Data) =>
        write({ orgId: principal.orgId, type, actor: actorOf(principal), target, data })
      return AuditLog.of({
        write,
        writeBy,
        record,
        by: (principal, type, target, data) => Effect.orDie(writeBy(principal, type, target, data))
      })
    })
  )
}
