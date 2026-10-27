import { accountModeOf, type AddedCatalogServer, type CatalogServerStatus, type Connection, type McpCatalogEntry, type Resource, sameServerUrl } from "@pc/domain"

/** The org's MCP servers that point at this catalog entry's URL. */
export const serversFor = (entry: McpCatalogEntry, servers: ReadonlyArray<Resource>): ReadonlyArray<Resource> =>
  servers.filter((server) => server.config.kind === "mcp_server" && sameServerUrl(server.config.url, entry.url))

/**
 * Where one added server stands. Shared OAuth servers are as connected as their shared connection; a shared
 * token server is connected by its secret; per-user servers have nothing org-wide to finish.
 */
export const statusOf = (server: Resource, shared: Connection | null): CatalogServerStatus => {
  const config = server.config
  if (config.kind !== "mcp_server") return "not_connected"
  if (accountModeOf(config) === "per_user") return "per_user"
  if (config.auth === undefined || config.auth.type === "none") return "connected"
  if (config.auth.type === "secret") return config.auth.secretId === undefined ? "not_connected" : "connected"
  return shared === null ? "not_connected" : shared.status
}

export const addedServer = (server: Resource, shared: Connection | null): AddedCatalogServer => ({
  resourceId: server.id,
  name: server.name,
  accountMode: accountModeOf(server.config),
  status: statusOf(server, shared),
  connectedBy: shared?.connectedBy.email ?? null,
  connectedAt: shared?.connectedAt ?? null
})

/** `base`, else `base 2`, `base 3`, ... : the first name no resource of the kind uses yet (names are unique per kind). */
export const unusedName = (base: string, taken: ReadonlyArray<string>): string => {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`
    const candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}
