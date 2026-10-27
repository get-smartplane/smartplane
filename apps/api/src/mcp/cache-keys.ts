import type { ResourceId, UserId } from "@pc/domain"

/** KV key of an MCP server's cached tool list; cleared whenever the server resource changes. */
export const upstreamToolsKey = (serverId: ResourceId) => `mcp-tools:v1:${serverId}`

/**
 * KV key of one member's tool list from a per-user server (each account may see different tools); cleared when
 * that member connects, reconnects or disconnects, and when the server's account mode changes.
 */
export const upstreamUserToolsKey = (serverId: ResourceId, userId: UserId) => `${upstreamToolsKey(serverId)}:${userId}`
