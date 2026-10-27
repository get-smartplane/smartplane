import { type Actor, type Connection, UpstreamFailure } from "@pc/domain"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { AuditLog } from "../audit/audit-log"
import type { Envelope } from "../secrets/envelope"
import { open, seal } from "../secrets/envelope"
import { KeyRing } from "../secrets/key-ring"
import type { SecretPurpose } from "../secrets/secrets"
import type { StoredConnection } from "./connections-repo"
import { type StoredCredential, StoredCredentialJson } from "./credential"

const encode = Schema.encodeEffect(StoredCredentialJson)
const decode = Schema.decodeUnknownEffect(StoredCredentialJson)

/**
 * Envelope encryption for connection credentials, with the same KEKs and format as secret versions. Opening
 * is audited as `secret.accessed` on the connection, before decrypting, exactly like a secret read.
 */
export class ConnectionVault extends Context.Service<ConnectionVault, {
  readonly seal: (credential: StoredCredential) => Effect.Effect<Envelope>
  readonly open: (stored: StoredConnection, purpose: SecretPurpose, actor: Actor) => Effect.Effect<StoredCredential, UpstreamFailure>
}>()("api/connections/ConnectionVault") {
  static readonly layer = Layer.effect(
    ConnectionVault,
    Effect.gen(function*() {
      const keys = yield* KeyRing
      const audit = yield* AuditLog
      const unreadable = (connection: Connection) =>
        new UpstreamFailure({ upstream: connection.resourceId, message: "the connected account's credential is missing or unreadable; connect it again" })

      return ConnectionVault.of({
        seal: Effect.fn("ConnectionVault.seal")(function*(credential: StoredCredential) {
          return yield* seal(keys.current, Redacted.make(yield* Effect.orDie(encode(credential))))
        }),
        open: Effect.fn("ConnectionVault.open")(function*(stored: StoredConnection, purpose: SecretPurpose, actor: Actor) {
          const { connection, envelope } = stored
          yield* Effect.annotateCurrentSpan({ "connection.id": connection.id, "connection.mode": connection.mode })
          if (envelope === null) return yield* unreadable(connection)
          yield* audit.record({
            orgId: connection.orgId,
            type: "secret.accessed",
            actor,
            target: { type: "connection", id: connection.id },
            data: { purpose, resourceId: connection.resourceId, mode: connection.mode }
          })
          const kek = Option.getOrElse(keys.find(envelope.kekId), () => keys.current)
          const plaintext = yield* open(kek, envelope).pipe(Effect.mapError(() => unreadable(connection)))
          return yield* decode(Redacted.value(plaintext)).pipe(Effect.mapError(() => unreadable(connection)))
        })
      })
    })
  )
}
