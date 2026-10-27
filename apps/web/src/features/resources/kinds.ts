import type { Resource, ResourceKind } from "@pc/domain"
import { Braces, Database, FileCode2, Globe, KeyRound, Plug, Server, Wrench, type LucideIcon } from "lucide-react"

export interface KindMeta {
  readonly label: string
  readonly plural: string
  readonly icon: LucideIcon
  readonly description: string
}

/** Kinds listed under Resources; secrets and variables have their own page (`/secrets`). */
export const catalogKinds: ReadonlyArray<ResourceKind> = ["mcp_server", "tool", "skill", "database", "api", "integration"]

export const isCatalogKind = (kind: ResourceKind): boolean => catalogKinds.includes(kind)

export const kindMeta: { readonly [K in ResourceKind]: KindMeta } = {
  mcp_server: { label: "MCP server", plural: "MCP servers", icon: Server, description: "An upstream MCP server proxied through the gateway." },
  tool: { label: "Tool", plural: "Tools", icon: Wrench, description: "One tool of an MCP server, grantable on its own." },
  skill: { label: "Skill", plural: "Skills", icon: FileCode2, description: "Reusable instructions agents can load." },
  database: { label: "Database", plural: "Databases", icon: Database, description: "A database reached with a stored connection secret." },
  api: { label: "API", plural: "APIs", icon: Globe, description: "An HTTP API, optionally authenticated with a secret." },
  integration: { label: "Integration", plural: "Integrations", icon: Plug, description: "A catalog integration (GitHub, Slack, ...) whose actions become governed tools." },
  secret: { label: "Secret", plural: "Secrets", icon: KeyRound, description: "Envelope-encrypted; never shown or sent to agents." },
  variable: { label: "Variable", plural: "Variables", icon: Braces, description: "A plain configuration value." }
}

export const inCatalog = (resource: Resource): boolean => isCatalogKind(resource.config.kind)
