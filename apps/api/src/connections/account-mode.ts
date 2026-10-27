import { type AccountMode, accountModeOf, type Connection, type InvalidInput, type Principal, type Resource } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { actorOf } from "../audit/actor"
import { upstreamToolsKey, upstreamUserToolsKey } from "../mcp/cache-keys"
import { KvCache } from "../platform/kv"
import { ResourcesRepo } from "../resources/resources-repo"
import { ConnectionsRepo } from "./connections-repo"
import { retiredTokenSecret, withAccountMode } from "./mode-switch"

/**
 * Switching a resource between a shared account and per-user accounts. The old mode's accounts must not
 * linger as credentials nobody can see or use: its connections, and a shared OAuth2 integration's token
 * secret, are deleted in the same D1 batch that saves the new mode, and each is audited as disconnected.
 * Callers check `resources:manage` first.
 */
export class AccountModes extends Context.Service<AccountModes, {
  readonly switch: (principal: Principal, resource: Resource, mode: AccountMode) => Effect.Effect<Resource, InvalidInput>
}>()("api/connections/AccountModes") {
  static readonly layer = Layer.effect(
    AccountModes,
    Effect.gen(function*() {
      const resources = yield* ResourcesRepo
      const connections = yield* ConnectionsRepo
      const audit = yield* AuditLog
      const cache = yield* KvCache

      const disconnected = (principal: Principal, resource: Resource, connection: Connection | null, tokenSecretId: string | null) =>
        audit.by(principal, "connection.disconnected", { type: "resource", id: resource.id }, {
          connectionId: connection?.id ?? null,
          mode: connection?.mode ?? accountModeOf(resource.config),
          userId: connection?.userId ?? null,
          reason: "mode_changed",
          ...(tokenSecretId === null ? {} : { tokenSecretId })
        })

      return AccountModes.of({
        switch: Effect.fn("AccountModes.switch")(function*(principal: Principal, resource: Resource, mode: AccountMode) {
          const previous = accountModeOf(resource.config)
          const next: Resource = { ...resource, config: yield* withAccountMode(resource.config, mode), updatedAt: yield* DateTime.now }
          const retired = retiredTokenSecret(resource.config, mode)
          const doomed = yield* connections.inMode(resource.orgId, resource.id, previous)
          yield* Effect.annotateCurrentSpan({ "resource.id": resource.id, "connection.mode": mode, "connections.removed": doomed.length })
          yield* resources.switchAccountMode(next, previous, retired, actorOf(principal).id)

          // The managed token secret is reported with the shared connection, or on its own when it has none.
          const [first, ...rest] = doomed
          if (first !== undefined || retired !== null) yield* disconnected(principal, resource, first ?? null, retired)
          yield* Effect.forEach(rest, (connection) => disconnected(principal, resource, connection, null), { discard: true })
          if (retired !== null) {
            yield* audit.by(principal, "resource.deleted", { type: "resource", id: retired }, { reason: "mode_changed", integrationId: resource.id })
          }
          yield* cache.remove(upstreamToolsKey(resource.id))
          yield* Effect.forEach(doomed, (connection) => connection.userId === null ? Effect.void : cache.remove(upstreamUserToolsKey(resource.id, connection.userId)), {
            discard: true
          })
          yield* audit.by(principal, "resource.updated", { type: "resource", id: resource.id }, { fields: ["config"], accountMode: mode })
          return next
        })
      })
    })
  )
}
