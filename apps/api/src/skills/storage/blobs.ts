import type { OrgId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { WorkerBindings } from "../../platform/bindings"

const keyOf = (orgId: OrgId, sha256: string) => `skills/${orgId}/${sha256}`

/**
 * Skill file contents in R2, addressed by sha256 within an org: identical files across versions are stored
 * once, and an object's key proves its content. Objects are never overwritten; the only delete is
 * `SkillIngest` undoing a put of its own when the version it was for could not be stored.
 */
export class SkillBlobs extends Context.Service<SkillBlobs, {
  /** True when this call created the object, false when it was already there. */
  readonly put: (orgId: OrgId, sha256: string, bytes: Uint8Array) => Effect.Effect<boolean>
  readonly remove: (orgId: OrgId, sha256: string) => Effect.Effect<void>
  readonly get: (orgId: OrgId, sha256: string) => Effect.Effect<Option.Option<Uint8Array>>
}>()("api/skills/SkillBlobs") {
  static readonly layer = Layer.effect(
    SkillBlobs,
    Effect.gen(function*() {
      const bucket = (yield* WorkerBindings).SKILLS
      return SkillBlobs.of({
        put: Effect.fn("SkillBlobs.put")(function*(orgId: OrgId, sha256: string, bytes: Uint8Array) {
          const key = keyOf(orgId, sha256)
          if ((yield* Effect.promise(() => bucket.head(key))) !== null) return false
          yield* Effect.promise(() => bucket.put(key, new Uint8Array(bytes), { sha256 }))
          return true
        }),
        remove: Effect.fn("SkillBlobs.remove")(function*(orgId: OrgId, sha256: string) {
          yield* Effect.promise(() => bucket.delete(keyOf(orgId, sha256)))
        }),
        get: Effect.fn("SkillBlobs.get")(function*(orgId: OrgId, sha256: string) {
          const object = yield* Effect.promise(() => bucket.get(keyOf(orgId, sha256)))
          if (object === null) return Option.none()
          return Option.some(new Uint8Array(yield* Effect.promise(() => object.arrayBuffer())))
        })
      })
    })
  )

  /** In memory, for tests and local tooling. */
  static readonly memory = (store = new Map<string, Uint8Array>()) =>
    Layer.succeed(SkillBlobs, {
      put: (orgId, sha256, bytes) =>
        Effect.sync(() => {
          const key = keyOf(orgId, sha256)
          if (store.has(key)) return false
          store.set(key, bytes)
          return true
        }),
      remove: (orgId, sha256) => Effect.sync(() => void store.delete(keyOf(orgId, sha256))),
      get: (orgId, sha256) => Effect.sync(() => Option.fromUndefinedOr(store.get(keyOf(orgId, sha256))))
    })
}
