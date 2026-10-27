import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { Resources } from "../resources/resources"
import { now, userPrincipal } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { seedOrg } from "../testing/seed"
import { SecretStatuses } from "./secret-statuses"

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const layer = SecretStatuses.layer.pipe(Layer.provideMerge(resourceServices()))
const secret = (name: string) => Resources.use((resources) => resources.create(admin, { name, description: "", projectId: null, config: { kind: "secret", value: Redacted.make("v1") } }))

describe("secret statuses", () => {
  it.effect("list each live secret's latest version and its time, never a value, for resources:manage, or visible ones", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const rotated = yield* secret("Rotated")
      const fresh = yield* secret("Fresh")
      const removed = yield* secret("Removed")
      yield* TestClock.adjust("1 hour")
      yield* Resources.use((resources) => resources.rotateSecret(admin, rotated.id, { value: Redacted.make("v2") }))
      yield* Resources.use((resources) => resources.remove(admin, removed.id))

      const statuses = yield* SecretStatuses.use((service) => service.list(admin))
      const byId = new Map(statuses.map((status) => [status.resourceId, status]))
      assert.deepStrictEqual([...byId.keys()].sort(), [fresh.id, rotated.id].sort())
      assert.strictEqual(byId.get(fresh.id)?.version, 1)
      assert.strictEqual(byId.get(rotated.id)?.version, 2)
      assert.isTrue((byId.get(rotated.id)?.versionCreatedAt.epochMilliseconds ?? 0) > (byId.get(fresh.id)?.versionCreatedAt.epochMilliseconds ?? 0))
      assert.notInclude(JSON.stringify(statuses), "v1")
      // Members see only secrets visible to them (deliverable ones they hold a use grant on): none here.
      assert.deepStrictEqual(yield* SecretStatuses.use((service) => service.list(userPrincipal())), [])
      assert.strictEqual((yield* Effect.flip(SecretStatuses.use((service) => service.list(userPrincipal({ permissions: [] })))))._tag, "Forbidden")
    }).pipe(Effect.provide(layer)))
})
