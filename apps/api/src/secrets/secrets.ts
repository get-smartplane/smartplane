import { type Actor, NotFound, type OrgId, type ResourceId, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option, type Redacted } from "effect"
import { AuditLog } from "../audit/audit-log"
import { open, seal } from "./envelope"
import { KeyRing } from "./key-ring"
import { SecretVersionsRepo } from "./versions-repo"

/** Why a secret is being read; recorded on the `secret.accessed` audit event. */
export type SecretPurpose = "upstream_auth" | "oauth_client" | "skill_source"

/** One `secret.delivered` event's actor and data (purpose, caller, project); never the value. */
export interface DeliveryRecord {
  readonly actor: Actor
  readonly data: Readonly<Record<string, unknown>>
}

/** Who wrote a version: a person, or a subsystem such as the OAuth token refresher. */
export type SecretAuthor = UserId | `system:${string}`

/**
 * The only way plaintext secrets move: in as `Redacted` to be sealed, out as `Redacted` for server-side use
 * (`reveal`) or for secret delivery (`deliver`), which the caller may only use for secrets marked
 * `deliverable` (see `deliverability`). Every read is audited before decryption.
 */
export class Secrets extends Context.Service<Secrets, {
  readonly store: (resourceId: ResourceId, value: Redacted.Redacted<string>, by: SecretAuthor) => Effect.Effect<number>
  readonly reveal: (
    orgId: OrgId,
    resourceId: ResourceId,
    purpose: SecretPurpose,
    actor: Actor
  ) => Effect.Effect<Redacted.Redacted<string>, NotFound>
  /** Records `secret.delivered` (not `secret.accessed`: one event per delivered secret) and opens the newest version. */
  readonly deliver: (
    orgId: OrgId,
    resourceId: ResourceId,
    record: DeliveryRecord
  ) => Effect.Effect<{ readonly value: Redacted.Redacted<string>; readonly version: number }, NotFound>
}>()("api/secrets/Secrets") {
  static readonly layer = Layer.effect(
    Secrets,
    Effect.gen(function*() {
      const versions = yield* SecretVersionsRepo
      const keys = yield* KeyRing
      const audit = yield* AuditLog

      return Secrets.of({
        store: Effect.fn("Secrets.store")(function*(resourceId: ResourceId, value: Redacted.Redacted<string>, by: SecretAuthor) {
          return yield* versions.append(resourceId, yield* seal(keys.current, value), by)
        }),
        reveal: Effect.fn("Secrets.reveal")(function*(orgId: OrgId, resourceId: ResourceId, purpose: SecretPurpose, actor: Actor) {
          const envelope = yield* versions.latest(orgId, resourceId).pipe(
            Effect.flatMap(Effect.fromOption),
            Effect.mapError(() => new NotFound({ entity: "resource", id: resourceId }))
          )
          // Audit before decrypting: an attempted read is evidence even if decryption then fails.
          yield* audit.record({ orgId, type: "secret.accessed", actor, target: { type: "resource", id: resourceId }, data: { purpose } })
          // Versions not yet re-wrapped open with their previous KEK. A KEK missing from the config or a tampered
          // row is an operational fault, not a caller error.
          return yield* Effect.orDie(open(Option.getOrElse(keys.find(envelope.kekId), () => keys.current), envelope))
        }),
        deliver: Effect.fn("Secrets.deliver")(function*(orgId: OrgId, resourceId: ResourceId, record: DeliveryRecord) {
          const envelope = yield* versions.latestVersioned(orgId, resourceId).pipe(
            Effect.flatMap(Effect.fromOption),
            Effect.mapError(() => new NotFound({ entity: "resource", id: resourceId }))
          )
          const { version } = envelope
          yield* audit.record({ orgId, type: "secret.delivered", actor: record.actor, target: { type: "resource", id: resourceId }, data: { ...record.data, version } })
          const value = yield* Effect.orDie(open(Option.getOrElse(keys.find(envelope.kekId), () => keys.current), envelope))
          return { value, version }
        })
      })
    })
  )
}
