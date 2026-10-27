import { actionImplies, deliverability, hasPermission, type Principal, type Resource, type ResourceId } from "@pc/domain"
import type { EffectiveAccess, EffectiveGrant } from "../access/resolution"

/**
 * Which resources a principal may see in the dashboard and API. `resources:manage` sees everything;
 * `resources:browse` the catalogue minus secrets; everyone else only what they hold a live grant on.
 * `grants:manage` implies the catalogue: granting needs to see what can be granted, secrets excepted.
 * The one exception for secrets: a `deliverable` secret the principal holds a live `use` grant on is shown
 * (metadata only, as always), so people know what `smartplane run` gives them. `gateway_only` stay hidden.
 */
export type Visibility =
  | { readonly _tag: "Everything" }
  | {
    readonly _tag: "Catalogue"
    /** Deliverable secrets the principal may receive (see `receivableSecrets`). */
    readonly secrets: ReadonlySet<ResourceId>
  }
  | {
    readonly _tag: "Granted"
    /** Resources shown in full: granted ones and the tools a granted MCP server lets them call. */
    readonly full: ReadonlySet<ResourceId>
    /** MCP servers shown only as the parent of a granted tool: name and kind, no connection details. */
    readonly minimal: ReadonlySet<ResourceId>
  }

/** What the principal's permissions alone grant; the catalogue still needs grants for its secrets. */
export const permissionVisibility = (principal: Principal): "Everything" | "Catalogue" | undefined => {
  if (hasPermission(principal, "resources:manage")) return "Everything"
  if (hasPermission(principal, "resources:browse") || hasPermission(principal, "grants:manage")) return "Catalogue"
  return undefined
}

/** Secrets marked `deliverable` that the principal holds a live `use` (or higher) grant on. */
export const receivableSecrets = (access: EffectiveAccess): ReadonlySet<ResourceId> =>
  new Set(Array.from(access.values()).flatMap(({ resource, action }) =>
    resource.config.kind === "secret" && deliverability(resource.config) === "deliverable" && actionImplies(action, "use") ? [resource.id] : []
  ))

const allowsTool = (grant: EffectiveGrant, toolName: string): boolean =>
  grant.terms.some(({ conditions }) => conditions.tools === undefined || conditions.tools.includes(toolName))

const inScope = (principal: Principal, resource: Resource): boolean =>
  principal.projectId === null || resource.projectId === null || resource.projectId === principal.projectId

/**
 * Builds the grant-based view from the gateway's own resolution. A granted server brings along its `tool`
 * resources that its grants allow; a granted tool brings along its server in minimal form. Secrets count
 * only when receivable (deliverable, `use`+); otherwise they are used only through the resource they serve.
 */
export const grantedVisibility = (principal: Principal, access: EffectiveAccess, tools: ReadonlyArray<Resource>): Visibility => {
  const full = new Set<ResourceId>()
  const minimal = new Set<ResourceId>()
  const secrets = receivableSecrets(access)
  for (const { resource } of access.values()) if (resource.config.kind !== "secret" || secrets.has(resource.id)) full.add(resource.id)
  for (const tool of tools) {
    if (tool.config.kind !== "tool" || !inScope(principal, tool)) continue
    const server = access.get(tool.config.serverId)
    if (server !== undefined && allowsTool(server, tool.config.toolName)) full.add(tool.id)
  }
  for (const { resource } of access.values()) {
    if (resource.config.kind === "tool" && !full.has(resource.config.serverId)) minimal.add(resource.config.serverId)
  }
  return { _tag: "Granted", full, minimal }
}

export const canSee = (visibility: Visibility, resource: Resource): boolean => {
  switch (visibility._tag) {
    case "Everything":
      return true
    case "Catalogue":
      return resource.config.kind !== "secret" || visibility.secrets.has(resource.id)
    case "Granted":
      return visibility.full.has(resource.id) || visibility.minimal.has(resource.id)
  }
}

/** The resource as this principal sees it: a server known only through a granted tool loses its connection details. */
export const present = (visibility: Visibility, resource: Resource): Resource => {
  if (visibility._tag !== "Granted" || visibility.full.has(resource.id) || resource.config.kind !== "mcp_server") return resource
  const { auth: _auth, ...config } = resource.config
  return { ...resource, config }
}

/** Visible resources, presented; order is kept. */
export const visibleOnly = (visibility: Visibility, resources: ReadonlyArray<Resource>): ReadonlyArray<Resource> =>
  resources.filter((resource) => canSee(visibility, resource)).map((resource) => present(visibility, resource))
