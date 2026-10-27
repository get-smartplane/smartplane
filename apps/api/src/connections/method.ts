import { accountModeOf, type ConnectionMethod, type ConnectMethod, type Resource, type ResourceConfig } from "@pc/domain"

/** What "connect" means for a resource: nothing, an admin's secret reference, a pasted secret or an OAuth sign-in. */
export const connectMethodOf = (config: ResourceConfig): ConnectMethod => {
  const perUser = accountModeOf(config) === "per_user"
  switch (config.kind) {
    case "mcp_server":
      if (config.auth === undefined || config.auth.type === "none") return "none"
      if (config.auth.type === "oauth") return "oauth"
      return perUser ? "secret" : "secret_reference"
    case "api":
      return perUser ? "secret" : config.authSecretId === undefined ? "none" : "secret_reference"
    case "integration":
      if (config.connection.type === "none") return "none"
      if (config.connection.type === "oauth2") return "oauth"
      return perUser ? "secret" : "secret_reference"
    default:
      return "none"
  }
}

/** How a connection row of this resource holds its credential; `null` when the resource has no connections. */
export const connectionMethodOf = (config: ResourceConfig): ConnectionMethod | null => {
  const method = connectMethodOf(config)
  return method === "oauth" ? "oauth" : method === "secret" ? "secret" : null
}

/**
 * Whether calls take their credential from a connection row (encrypted in `connections`) rather than from a
 * `secret` resource or nothing. Shared integrations keep their OAuth tokens in their managed token secret, so
 * only their per-user connections are connection-backed.
 */
export const isConnectionBacked = (resource: Resource): boolean => {
  const method = connectionMethodOf(resource.config)
  if (method === null) return false
  return resource.config.kind !== "integration" || accountModeOf(resource.config) === "per_user"
}
