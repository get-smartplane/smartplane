import { accountModeOf, actionImplies, type Connection, type MyConnection } from "@pc/domain"
import type { EffectiveAccess } from "../access/resolution"
import { connectMethodOf } from "./method"

/**
 * "My connections": per-user resources the member may use, with their own account if connected. A `read`
 * grant shows a resource in the catalogue but never makes it connectable.
 */
export const myConnections = (access: EffectiveAccess, own: ReadonlyArray<Connection>): ReadonlyArray<MyConnection> =>
  Array.from(access.values())
    .filter(({ action, resource }) =>
      actionImplies(action, "use") && accountModeOf(resource.config) === "per_user" && connectMethodOf(resource.config) !== "none")
    .map(({ resource }): MyConnection => ({
      resource: { id: resource.id, name: resource.name, kind: resource.config.kind },
      method: connectMethodOf(resource.config),
      connection: own.find((connection) => connection.resourceId === resource.id) ?? null
    }))
