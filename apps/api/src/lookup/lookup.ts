import {
  type Forbidden,
  hasPermission,
  isBuiltinRole,
  type LookupEntry,
  type LookupRef,
  type LookupResult,
  type Principal,
  ResourceId
} from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"
import { requirePermission } from "../auth/permissions"
import { builtinRoles } from "../org/builtin-roles"
import { ResourceVisibility } from "../resources/resource-visibility"
import { LookupRepo } from "./lookup-repo"

const isResourceId = Schema.is(ResourceId)

const builtinLabel = (slug: string): ReadonlyArray<LookupEntry> =>
  builtinRoles.filter((role) => role.slug === slug).map((role) => ({ kind: "role", id: role.slug, label: role.name, detail: "builtin", gone: false }))

/** Batched display names for the dashboard: one query per entity kind, deduplicated, scoped to the caller's org. */
export class Lookup extends Context.Service<Lookup, {
  readonly resolve: (principal: Principal, refs: ReadonlyArray<LookupRef>) => Effect.Effect<LookupResult, Forbidden>
}>()("api/lookup/Lookup") {
  static readonly layer = Layer.effect(
    Lookup,
    Effect.gen(function*() {
      const repo = yield* LookupRepo
      const visibility = yield* ResourceVisibility

      /**
       * Resource names follow resource visibility, so a lookup cannot list what `GET /resources` hides.
       * Holders of `audit:read` resolve every resource: the audit log they may read already names them.
       */
      const visibleResources = (principal: Principal, entries: ReadonlyArray<LookupEntry>) =>
        Effect.gen(function*() {
          if (hasPermission(principal, "audit:read")) return entries
          const ids = entries.flatMap((entry) => (entry.kind === "resource" && isResourceId(entry.id) ? [entry.id] : []))
          if (ids.length === 0) return entries
          const visible: ReadonlySet<string> = yield* visibility.visibleIds(principal, ids)
          return entries.filter((entry) => entry.kind !== "resource" || visible.has(entry.id))
        })

      return Lookup.of({
        resolve: Effect.fn("Lookup.resolve")(function*(principal: Principal, refs: ReadonlyArray<LookupRef>) {
          yield* requirePermission(principal, "resources:read")
          const byKind = new Map<LookupRef["kind"], Set<string>>()
          for (const ref of refs) byKind.set(ref.kind, (byKind.get(ref.kind) ?? new Set()).add(ref.id))
          yield* Effect.annotateCurrentSpan({ "lookup.refs": refs.length, "lookup.kinds": byKind.size })
          const builtin = [...(byKind.get("role") ?? [])].filter(isBuiltinRole).flatMap(builtinLabel)
          const found = yield* Effect.forEach(byKind, ([kind, ids]) => repo.labels(principal.orgId, kind, [...ids]), { concurrency: 4 })
          const result: LookupResult = { entries: [...builtin, ...(yield* visibleResources(principal, found.flat()))] }
          return result
        })
      })
    })
  )
}
