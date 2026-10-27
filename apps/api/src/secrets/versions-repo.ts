import { type OrgId, type ResourceId, SecretStatus } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows } from "../platform/sql"
import type { Envelope } from "./envelope"
import type { SecretAuthor } from "./secrets"

const EnvelopeRow = Schema.Struct({
  ciphertext: Schema.String,
  iv: Schema.String,
  wrappedDek: Schema.String,
  kekId: Schema.String
})
const VersionRow = Schema.Struct({ version: Schema.Int })
const VersionedEnvelopeRow = Schema.Struct({ ...EnvelopeRow.fields, version: Schema.Int })
const StatusRow = Schema.toCodecJson(SecretStatus)

/**
 * Encrypted secret versions. Rows are append-only: rotation adds a version, nothing is overwritten. The one
 * exception is KEK rotation, which re-wraps a data key in place (see WrappedKeysRepo).
 */
export class SecretVersionsRepo extends Context.Service<SecretVersionsRepo, {
  /** Appends the next version atomically and returns its number. */
  readonly append: (resourceId: ResourceId, envelope: Envelope, by: SecretAuthor) => Effect.Effect<number>
  /** The newest version of a live secret resource in `orgId`. */
  readonly latest: (orgId: OrgId, resourceId: ResourceId) => Effect.Effect<Option.Option<Envelope>>
  /** `latest` with its version number, which secret delivery reports so clients can tell a rotation happened. */
  readonly latestVersioned: (orgId: OrgId, resourceId: ResourceId) => Effect.Effect<Option.Option<Envelope & { readonly version: number }>>
  /** The newest version number and its time, for every live secret in `orgId`; never key material. */
  readonly statuses: (orgId: OrgId) => Effect.Effect<ReadonlyArray<SecretStatus>>
}>()("api/secrets/SecretVersionsRepo") {
  static readonly layer = Layer.effect(
    SecretVersionsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return SecretVersionsRepo.of({
        append: Effect.fn("SecretVersionsRepo.append")(function*(resourceId: ResourceId, envelope: Envelope, by: SecretAuthor) {
          const now = DateTime.formatIso(yield* DateTime.now)
          const inserted = yield* decodeFirst(VersionRow)(
            sql`INSERT INTO secret_versions (resource_id, version, ciphertext, iv, wrapped_dek, kek_id, created_by, created_at)
                SELECT ${resourceId}, COALESCE(MAX(version), 0) + 1, ${envelope.ciphertext}, ${envelope.iv},
                       ${envelope.wrappedDek}, ${envelope.kekId}, ${by}, ${now}
                  FROM secret_versions WHERE resource_id = ${resourceId}
                RETURNING version`
          )
          return yield* Effect.fromOption(inserted).pipe(Effect.map((row) => row.version), Effect.orDie)
        }),
        latest: Effect.fn("SecretVersionsRepo.latest")((orgId: OrgId, resourceId: ResourceId) =>
          decodeFirst(EnvelopeRow)(
            sql`SELECT sv.ciphertext, sv.iv, sv.wrapped_dek, sv.kek_id
                  FROM secret_versions sv JOIN resources r ON r.id = sv.resource_id
                 WHERE sv.resource_id = ${resourceId} AND r.org_id = ${orgId} AND r.kind = 'secret' AND r.deleted_at IS NULL
                 ORDER BY sv.version DESC LIMIT 1`
          )
        ),
        latestVersioned: Effect.fn("SecretVersionsRepo.latestVersioned")((orgId: OrgId, resourceId: ResourceId) =>
          decodeFirst(VersionedEnvelopeRow)(
            sql`SELECT sv.ciphertext, sv.iv, sv.wrapped_dek, sv.kek_id, sv.version
                  FROM secret_versions sv JOIN resources r ON r.id = sv.resource_id
                 WHERE sv.resource_id = ${resourceId} AND r.org_id = ${orgId} AND r.kind = 'secret' AND r.deleted_at IS NULL
                 ORDER BY sv.version DESC LIMIT 1`
          )
        ),
        statuses: Effect.fn("SecretVersionsRepo.statuses")((orgId: OrgId) =>
          decodeRows(StatusRow)(
            sql`SELECT sv.resource_id, sv.version, sv.created_at AS version_created_at
                  FROM secret_versions sv JOIN resources r ON r.id = sv.resource_id
                 WHERE r.org_id = ${orgId} AND r.kind = 'secret' AND r.deleted_at IS NULL
                   AND sv.version = (SELECT MAX(version) FROM secret_versions WHERE resource_id = sv.resource_id)`
          )
        )
      })
    })
  )
}
