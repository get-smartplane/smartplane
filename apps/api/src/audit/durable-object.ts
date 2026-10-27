import { OrgId } from "@pc/domain"
import { DurableObject } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"
import { WorkerBindings, type WorkerEnv } from "../platform/bindings"
import { AppConfig } from "../platform/config"
import { DatabaseLive } from "../platform/database"
import { continueTrace } from "../telemetry/trace-context"
import { makeRunner, type Runner } from "../workers/runner"
import { AuditChain } from "./chain-writer"
import { runLocked } from "./locked-run"
import { AuditStore } from "./store"
import { AuditEventsWire, ChainVerificationWire } from "./wire"

const decodeOrgId = Schema.decodeUnknownEffect(OrgId)

/**
 * One instance per org (named by org id). It is the only writer of that org's audit chain, so seq and
 * prevHash are derived without races. Exported from the Worker as `AuditLog`.
 */
export class AuditLogObject extends DurableObject<WorkerEnv> {
  private readonly runner: Runner<AuditChain>

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env)
    this.runner = makeRunner(
      AuditChain.layer.pipe(
        Layer.provide(AuditStore.layer),
        Layer.provide(DatabaseLive),
        Layer.provideMerge(AppConfig.fromEnv(env)),
        Layer.provide(Layer.succeed(WorkerBindings, env))
      )
    )
  }

  /**
   * Returns how many events were newly written; redelivered events are skipped. `trace` is the caller's W3C
   * trace context (untrusted, decoded), so these spans join the caller's trace.
   */
  append(orgId: string, events: unknown, trace?: unknown): Promise<number> {
    const program = Effect.gen(function*() {
      const chain = yield* AuditChain
      const decoded = yield* Schema.decodeUnknownEffect(AuditEventsWire)(events)
      return yield* chain.append(yield* decodeOrgId(orgId), decoded)
    }).pipe(continueTrace("AuditLogObject.append", trace, { kind: "server", attributes: { "org.id": orgId } }))
    // D1 calls are not storage operations, so input gates would let a second batch interleave; block explicitly.
    return runLocked(this.ctx, this.runner.run, program)
  }

  verify(orgId: string, fromSeq: number, trace?: unknown): Promise<unknown> {
    return this.runner.run(
      Effect.gen(function*() {
        const chain = yield* AuditChain
        const verification = yield* chain.verify(yield* decodeOrgId(orgId), fromSeq)
        return yield* Schema.encodeEffect(ChainVerificationWire)(verification)
      }).pipe(continueTrace("AuditLogObject.verify", trace, { kind: "server", attributes: { "org.id": orgId } })),
      (flush) => this.ctx.waitUntil(flush)
    )
  }
}
