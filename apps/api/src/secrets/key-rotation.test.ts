import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, ResourceId } from "@pc/domain"
import { DateTime, Effect, Exit, Layer, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { AuditLog } from "../audit/audit-log"
import { ConnectionKeysRepo } from "../connections/wrapped-keys"
import { systemActor } from "../audit/actor"
import { toBase64 } from "../platform/encoding"
import { TestDatabase } from "../testing/database"
import { now, orgId, userId } from "../testing/fixtures"
import { insertRow, memoryAuditQueue, seedOrg, selectRows } from "../testing/seed"
import { importKek, type Kek } from "./envelope"
import { KeyRing } from "./key-ring"
import { KeyRotation } from "./key-rotation"
import { Secrets } from "./secrets"
import { SecretVersionsRepo } from "./versions-repo"
import { WrappedKeysRepo } from "./wrapped-keys-repo"

const resourceId = ResourceId.make("res_secret0001")
const randomKek = (id: string) => importKek(id, Redacted.make(toBase64(crypto.getRandomValues(new Uint8Array(32)))))

/** Secrets and KeyRotation over one shared database, with the KEK configuration of a given deploy. */
const deploy = (ring: KeyRing["Service"], events: Array<AuditEvent>, connectionKeys: Layer.Layer<ConnectionKeysRepo, never, SqlClient.SqlClient> = ConnectionKeysRepo.layer) =>
  Layer.mergeAll(Secrets.layer, KeyRotation.layer).pipe(
    Layer.provide(
      Layer.mergeAll(
        SecretVersionsRepo.layer,
        WrappedKeysRepo.layer,
        connectionKeys,
        AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))),
        Layer.succeed(KeyRing, ring)
      )
    )
  )

const reveal = Secrets.use((secrets) => secrets.reveal(orgId, resourceId, "upstream_auth", systemActor("test")))
const rows = selectRows("SELECT version, ciphertext, iv, wrapped_dek, kek_id FROM secret_versions ORDER BY version")

const seedSecret = (old: Kek, events: Array<AuditEvent>) =>
  Effect.gen(function*() {
    yield* seedOrg
    yield* insertRow("resources", {
      id: resourceId,
      orgId,
      kind: "secret",
      name: "stripe",
      description: "",
      config: JSON.stringify({ kind: "secret" }),
      createdBy: userId,
      createdAt: DateTime.formatIso(now)
    })
    yield* Secrets.use((secrets) =>
      Effect.andThen(secrets.store(resourceId, Redacted.make("plaintext-one"), userId), secrets.store(resourceId, Redacted.make("plaintext-two"), userId))
    ).pipe(Effect.provide(deploy(KeyRing.make(old), events)))
  })

describe("KEK rotation", () => {
  it.effect("re-wraps data keys onto the current KEK without touching ciphertext, then works without the old KEK", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      const old = yield* randomKek("kek-1")
      const current = yield* randomKek("kek-2")
      yield* seedSecret(old, events)
      const before = yield* rows

      const rotating = deploy(KeyRing.make(current, [old]), events)
      assert.strictEqual(Redacted.value(yield* reveal.pipe(Effect.provide(rotating))), "plaintext-two", "old versions still open mid-rotation")
      const result = yield* KeyRotation.use((rotation) => rotation.rewrap(undefined, systemActor("cron"))).pipe(Effect.provide(rotating))
      assert.deepStrictEqual(result, { kekId: "kek-2", rewrapped: 2, remaining: 0 })

      const after = yield* rows
      assert.deepStrictEqual(after.map((row) => row.kekId), ["kek-2", "kek-2"])
      assert.deepStrictEqual(after.map((row) => [row.ciphertext, row.iv]), before.map((row) => [row.ciphertext, row.iv]))
      assert.notDeepEqual(after.map((row) => row.wrappedDek), before.map((row) => row.wrappedDek))

      const retired = deploy(KeyRing.make(current), events)
      assert.strictEqual(Redacted.value(yield* reveal.pipe(Effect.provide(retired))), "plaintext-two", "the old KEK can be removed")

      const rewrapped = events.filter((event) => event.type === "secret.rewrapped")
      assert.strictEqual(rewrapped.length, 1)
      assert.deepStrictEqual(rewrapped[0]?.data, { kekId: "kek-2", fromKekIds: ["kek-1"], versions: 2, connections: 0, resourceIds: [resourceId] })
      // Distinctive values: a short literal like "v2" can appear inside random ids and fail by chance.
      assert.notInclude(JSON.stringify(events), "plaintext-", "no plaintext in audit data")
    }).pipe(Effect.provide(TestDatabase))
  })

  it.effect("is a no-op when everything is current, and reports versions under a KEK that is no longer configured", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      const lost = yield* randomKek("kek-lost")
      const current = yield* randomKek("kek-2")
      yield* seedSecret(lost, events)
      const misconfigured = deploy(KeyRing.make(current), events)
      const result = yield* KeyRotation.use((rotation) => rotation.rewrap(orgId, systemActor("cron"))).pipe(Effect.provide(misconfigured))
      assert.deepStrictEqual(result, { kekId: "kek-2", rewrapped: 0, remaining: 2 })
      assert.isTrue(Exit.isFailure(yield* Effect.exit(reveal.pipe(Effect.provide(misconfigured)))), "removing a KEK too early is fatal")
      assert.strictEqual(events.filter((event) => event.type === "secret.rewrapped").length, 0)
    }).pipe(Effect.provide(TestDatabase))
  })

  it.effect("audits the versions it re-wrapped even when a later phase of the batch fails", () => {
    const events: Array<AuditEvent> = []
    const brokenConnections = Layer.succeed(ConnectionKeysRepo, {
      wrappedBy: () => Effect.die(new Error("d1 blip")),
      replace: () => Effect.die(new Error("not reached")),
      countNotWrappedBy: () => Effect.succeed(0)
    })
    return Effect.gen(function*() {
      const old = yield* randomKek("kek-1")
      const current = yield* randomKek("kek-2")
      yield* seedSecret(old, events)
      const result = yield* KeyRotation.use((rotation) => rotation.rewrap(undefined, systemActor("cron"))).pipe(
        Effect.provide(deploy(KeyRing.make(current, [old]), events, brokenConnections))
      )
      assert.strictEqual(result.rewrapped, 2)
      const audited = events.filter((event) => event.type === "secret.rewrapped")
      assert.deepStrictEqual(audited.map((event) => [event.data.versions, event.data.connections]), [[2, 0]])
    }).pipe(Effect.provide(TestDatabase))
  })
})
