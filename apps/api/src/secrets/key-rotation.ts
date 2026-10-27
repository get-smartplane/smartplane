import type { Actor, Forbidden, KeyRewrapResult, OrgId, Principal } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { actorOf } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { requirePermission } from "../auth/permissions"
import { ConnectionKeysRepo, type StaleConnection } from "../connections/wrapped-keys"
import { rewrap } from "./envelope"
import { KeyRing } from "./key-ring"
import { type StaleVersion, WrappedKeysRepo } from "./wrapped-keys-repo"

/** Versions re-wrapped per call; the cron runs nightly and the endpoint can be called again for more. */
const BatchSize = 200

/** How many resource ids one audit event lists; the count is always exact. */
const AuditedIds = 100

/**
 * KEK rotation: moves data keys from previous KEKs to the current one, so a retired KEK can be removed from
 * the config once `remaining` is zero. Only wrapped data keys change; ciphertext never does.
 */
export class KeyRotation extends Context.Service<KeyRotation, {
  /** Re-wraps one batch, in one org or (cron) across orgs; audited per org. */
  readonly rewrap: (orgId: OrgId | undefined, actor: Actor) => Effect.Effect<KeyRewrapResult>
  /** The `secrets.rewrap` endpoint: the caller's org only, `org:manage`. */
  readonly rewrapFor: (principal: Principal) => Effect.Effect<KeyRewrapResult, Forbidden>
}>()("api/secrets/KeyRotation") {
  static readonly layer = Layer.effect(
    KeyRotation,
    Effect.gen(function*() {
      const keys = yield* KeyRing
      const repo = yield* WrappedKeysRepo
      const connectionKeys = yield* ConnectionKeysRepo
      const audit = yield* AuditLog

      const rewrapOne = (version: StaleVersion) =>
        Effect.fromOption(keys.find(version.kekId)).pipe(
          Effect.flatMap((from) => rewrap(from, keys.current, version)),
          Effect.flatMap((next) => repo.replace(version, next)),
          // Same id, different key material: an operator must fix the config; the rest of the batch goes on.
          Effect.catchTag(["DecryptionFailed", "NoSuchElementError"], () =>
            Effect.as(Effect.logError("cannot re-wrap secret version", { resourceId: version.resourceId, kekId: version.kekId }), false)),
          // Any other failure (a D1 blip) leaves this version stale for the next run; it must not abort the
          // batch, or versions already re-wrapped would never reach the audit event below.
          Effect.catchCause((cause) => Effect.as(Effect.logError("re-wrap failed", { resourceId: version.resourceId, cause }), false))
        )

      const rewrapConnection = (stale: StaleConnection) =>
        Effect.fromOption(keys.find(stale.kekId)).pipe(
          Effect.flatMap((from) => rewrap(from, keys.current, stale)),
          Effect.flatMap((next) => connectionKeys.replace(stale, next)),
          Effect.catchTag(["DecryptionFailed", "NoSuchElementError"], () =>
            Effect.as(Effect.logError("cannot re-wrap connection credential", { connectionId: stale.id, kekId: stale.kekId }), false)),
          Effect.catchCause((cause) => Effect.as(Effect.logError("re-wrap failed", { connectionId: stale.id, cause }), false))
        )

      const auditOrg = (orgId: OrgId, versions: ReadonlyArray<StaleVersion>, connections: ReadonlyArray<StaleConnection>, actor: Actor) =>
        audit.record({
          orgId,
          type: "secret.rewrapped",
          actor,
          target: null,
          data: {
            kekId: keys.current.id,
            fromKekIds: [...new Set(versions.map((version) => version.kekId))],
            versions: versions.length,
            connections: connections.length,
            resourceIds: [...new Set(versions.map((version) => version.resourceId))].slice(0, AuditedIds)
          }
        })

      const rewrapBatch = Effect.fn("KeyRotation.rewrap")(function*(orgId: OrgId | undefined, actor: Actor) {
        const previousIds = keys.previous.map((kek) => kek.id)
        const stale = yield* repo.wrappedBy(previousIds, orgId, BatchSize)
        const done = yield* Effect.filter(stale, rewrapOne, { concurrency: 8 })
        const doneConnections = yield* connectionKeys.wrappedBy(previousIds, orgId, BatchSize).pipe(
          Effect.flatMap((staleConnections) => Effect.filter(staleConnections, rewrapConnection, { concurrency: 8 })),
          Effect.catchCause((cause) => Effect.as(Effect.logError("connection re-wrap phase failed", { cause }), []))
        )
        const orgIds = [...new Set([...done, ...doneConnections].map((item) => item.orgId))]
        yield* Effect.forEach(orgIds, (org) =>
          auditOrg(org, done.filter((version) => version.orgId === org), doneConnections.filter((connection) => connection.orgId === org), actor), { discard: true })
        const remaining = (yield* repo.countNotWrappedBy(keys.current.id, orgId)) + (yield* connectionKeys.countNotWrappedBy(keys.current.id, orgId))
        const rewrapped = done.length + doneConnections.length
        yield* Effect.annotateCurrentSpan({ "secrets.kek_id": keys.current.id, "secrets.rewrapped": rewrapped, "secrets.remaining": remaining })
        const result: KeyRewrapResult = { kekId: keys.current.id, rewrapped, remaining }
        return result
      })

      return KeyRotation.of({
        rewrap: rewrapBatch,
        rewrapFor: Effect.fn("KeyRotation.rewrapFor")(function*(principal: Principal) {
          yield* requirePermission(principal, "org:manage")
          return yield* rewrapBatch(principal.orgId, actorOf(principal))
        })
      })
    })
  )
}
