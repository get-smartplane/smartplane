import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { KvCache } from "../platform/kv"
import { admin } from "../testing/delivery-world"
import { now } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { seedOrg } from "../testing/seed"
import { Resources } from "./resources"

/** A KV whose invalidation dies, like a Workers KV outage after the D1 commit. */
const brokenKv = Layer.succeed(KvCache, {
  get: () => Effect.succeed(Option.none()),
  set: () => Effect.void,
  remove: () => Effect.die(new Error("kv down"))
})

describe("resource changes are audited right after they commit", () => {
  it.effect("a failing cache invalidation after a delete cannot skip the audit event", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const resources = yield* Resources
      const server = yield* resources.create(admin, {
        name: "upstream",
        description: "",
        projectId: null,
        config: { kind: "variable", value: "v1" }
      })
      yield* Effect.exit(resources.update(admin, server.id, { description: "changed" }))
      yield* Effect.exit(resources.remove(admin, server.id))
      assert.deepStrictEqual(events.map((event) => event.type).filter((type) => type.startsWith("resource.")), [
        "resource.created",
        "resource.updated",
        "resource.deleted"
      ])
    }).pipe(Effect.provide(resourceServices(events, brokenKv)))
  })
})
