import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { TestDatabase } from "../testing/database"
import { now, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg, seedResource } from "../testing/seed"
import { databaseVisibility } from "../testing/visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { Lookup } from "./lookup"
import { LookupRepo } from "./lookup-repo"

const layer = Lookup.layer.pipe(
  Layer.provide(Layer.mergeAll(LookupRepo.layer, databaseVisibility)),
  Layer.provideMerge(ResourcesRepo.layer),
  Layer.provideMerge(TestDatabase)
)

describe("lookup", () => {
  it.effect("resolves display names in one call, scoped to the caller's org", () =>
    Effect.gen(function*() {
      yield* seedOrg
      yield* seedResource("res_variable01")
      const at = DateTime.formatIso(now)
      yield* insertRow("orgs", { id: "org_otherorg1", workosOrgId: "org_w2", name: "Other", slug: "other", createdAt: at })
      yield* insertRow("resources", {
        id: "res_foreign001", orgId: "org_otherorg1", kind: "variable", name: "theirs", description: "", config: "{}", createdBy: "usr_testuser01", createdAt: at
      })
      const { entries } = yield* Lookup.use((lookup) =>
        // Resource names follow visibility (see resources/visibility.test.ts); a manager sees them all.
        lookup.resolve(userPrincipal({ permissions: ["resources:read", "resources:manage"] }), [
          { kind: "member", id: "mem_testmem01" },
          { kind: "user", id: "usr_testuser01" },
          { kind: "team", id: "team_testteam1" },
          { kind: "resource", id: "res_variable01" },
          { kind: "resource", id: "res_variable01" },
          { kind: "resource", id: "res_foreign001" },
          { kind: "role", id: "admin" },
          { kind: "grant", id: "grt_whatever01" }
        ])
      )
      const labels = Object.fromEntries(entries.map((entry) => [`${entry.kind}:${entry.id}`, entry.label]))
      assert.deepStrictEqual(labels, {
        "member:mem_testmem01": "ada@example.com",
        "user:usr_testuser01": "ada@example.com",
        "team:team_testteam1": "Backend",
        "resource:res_variable01": "res_variable01",
        "role:admin": "Admin"
      })
      assert.isTrue(entries.every((entry) => !entry.gone))
    }).pipe(Effect.provide(layer)))

  it.effect("requires resources:read", () =>
    Effect.gen(function*() {
      const error = yield* Lookup.use((lookup) => lookup.resolve(userPrincipal({ permissions: [] }), [{ kind: "team", id: "x" }])).pipe(Effect.flip)
      assert.strictEqual(error._tag, "Forbidden")
    }).pipe(Effect.provide(layer)))
})
